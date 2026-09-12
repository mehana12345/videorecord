import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { execute, queryOne } from './db.ts';

interface ParticipantState {
  socketId: string;
  userId: string;
  name: string;
  role: 'student' | 'faculty' | 'admin';
  isMuted: boolean;
  isCameraOff: boolean;
  isScreenSharing: boolean;
  joinedAt: string;
}

// Map of roomId (classId) -> Map of socketId -> ParticipantState
const roomParticipants = new Map<string, Map<string, ParticipantState>>();

export function setupSocketIO(httpServer: HttpServer) {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket: Socket) => {
    let currentRoomId: string | null = null;
    let currentUserState: ParticipantState | null = null;

    // Join a live classroom
    socket.on('join-room', ({ classId, user }) => {
      currentRoomId = classId;
      socket.join(classId);

      const participant: ParticipantState = {
        socketId: socket.id,
        userId: user.id,
        name: user.name,
        role: user.role,
        isMuted: false,
        isCameraOff: false,
        isScreenSharing: false,
        joinedAt: new Date().toISOString(),
      };
      currentUserState = participant;

      if (!roomParticipants.has(classId)) {
        roomParticipants.set(classId, new Map());
      }
      const room = roomParticipants.get(classId)!;
      room.set(socket.id, participant);

      // Return current participant list to the joining user
      const participantsList = Array.from(room.values());
      socket.emit('room-users', {
        participants: participantsList,
        roomId: classId,
      });

      // Broadcast to other users in the room that a new peer joined
      socket.to(classId).emit('user-joined', {
        participant,
        socketId: socket.id,
      });

      console.log(`User ${user.name} (${user.role}) joined room: ${classId}. Room count: ${room.size}`);
    });

    // WebRTC Signaling: Forward SDP Offer
    socket.on('offer', ({ targetSocketId, offer, senderInfo }) => {
      io.to(targetSocketId).emit('offer', {
        senderSocketId: socket.id,
        offer,
        senderInfo: senderInfo || currentUserState,
      });
    });

    // WebRTC Signaling: Forward SDP Answer
    socket.on('answer', ({ targetSocketId, answer }) => {
      io.to(targetSocketId).emit('answer', {
        senderSocketId: socket.id,
        answer,
      });
    });

    // WebRTC Signaling: Forward ICE Candidate
    socket.on('ice-candidate', ({ targetSocketId, candidate }) => {
      io.to(targetSocketId).emit('ice-candidate', {
        senderSocketId: socket.id,
        candidate,
      });
    });

    // Media toggle (Mute mic or camera off)
    socket.on('toggle-media', ({ isMuted, isCameraOff }) => {
      if (currentRoomId && currentUserState) {
        currentUserState.isMuted = isMuted ?? currentUserState.isMuted;
        currentUserState.isCameraOff = isCameraOff ?? currentUserState.isCameraOff;

        const room = roomParticipants.get(currentRoomId);
        if (room && room.has(socket.id)) {
          room.set(socket.id, currentUserState);
        }

        io.to(currentRoomId).emit('participant-media-changed', {
          socketId: socket.id,
          userId: currentUserState.userId,
          isMuted: currentUserState.isMuted,
          isCameraOff: currentUserState.isCameraOff,
        });
      }
    });

    // Screen sharing toggled
    socket.on('screen-share-changed', ({ isScreenSharing }) => {
      if (currentRoomId && currentUserState) {
        currentUserState.isScreenSharing = isScreenSharing;
        io.to(currentRoomId).emit('participant-screen-changed', {
          socketId: socket.id,
          userId: currentUserState.userId,
          name: currentUserState.name,
          isScreenSharing,
        });
      }
    });

    // Live chat message
    socket.on('send-chat', ({ classId, message, user }) => {
      const msgId = 'msg-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
      const timestamp = new Date().toISOString();

      try {
        execute(
          `INSERT INTO chat_messages (id, class_id, user_id, user_name, user_role, message, timestamp)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [msgId, classId, user.id, user.name, user.role, message, timestamp]
        );
      } catch (err) {
        console.error('Failed to save chat message in DB:', err);
      }

      io.to(classId).emit('chat-message', {
        id: msgId,
        classId,
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        message,
        timestamp,
      });
    });

    // Faculty moderation: mute student
    socket.on('moderate-mute', ({ classId, targetSocketId }) => {
      if (currentUserState?.role === 'faculty' || currentUserState?.role === 'admin') {
        io.to(targetSocketId).emit('force-mute');
        io.to(classId).emit('participant-moderated', {
          targetSocketId,
          action: 'muted',
          moderatorName: currentUserState.name,
        });
      }
    });

    // Faculty moderation: remove student from classroom
    socket.on('moderate-kick', ({ classId, targetSocketId }) => {
      if (currentUserState?.role === 'faculty' || currentUserState?.role === 'admin') {
        io.to(targetSocketId).emit('kicked-from-class', {
          reason: 'You have been removed from the class by faculty moderation.',
        });
      }
    });

    // Faculty ends the live class
    socket.on('class-ended-by-faculty', ({ classId }) => {
      if (currentUserState?.role === 'faculty' || currentUserState?.role === 'admin') {
        io.to(classId).emit('class-ended', {
          message: 'The faculty has ended this live class. Recording will be processed.',
        });
      }
    });

    // Disconnect cleanup
    const handleLeave = () => {
      if (currentRoomId && socket.id) {
        const room = roomParticipants.get(currentRoomId);
        if (room) {
          room.delete(socket.id);
          socket.to(currentRoomId).emit('user-left', {
            socketId: socket.id,
            userId: currentUserState?.userId,
            name: currentUserState?.name,
          });
          if (room.size === 0) {
            roomParticipants.delete(currentRoomId);
          }
        }
      }
    };

    socket.on('leave-room', handleLeave);
    socket.on('disconnect', handleLeave);
  });

  return io;
}

export function getRoomParticipantCount(classId: string): number {
  return roomParticipants.get(classId)?.size || 0;
}
