import mongoose from 'mongoose';

const RoomSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  status: {
    type: String,
    enum: ['waiting', 'ready', 'in_battle', 'closed'],
    default: 'waiting',
  },
  players: [
    {
      playerId: String,
      name: String,
      ready: { type: Boolean, default: false },
    },
  ],
  createdAt: { type: Date, default: Date.now },
});

export const Room = mongoose.model('Room', RoomSchema);
