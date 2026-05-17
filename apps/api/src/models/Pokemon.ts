import mongoose from 'mongoose';

export interface BaseStats {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

const PokemonSchema = new mongoose.Schema({
  pokedexId: { type: Number, required: true, unique: true },
  name: { type: String, required: true },
  types: [String],
  baseStats: {
    hp: Number,
    atk: Number,
    def: Number,
    spa: Number,
    spd: Number,
    spe: Number,
  },
  spriteUrl: String,
  damagingMoveIds: [String],
  statusMoveIds: [String],
  isLegendary: Boolean,
  isFinalEvolution: Boolean,
});

export const Pokemon = mongoose.model('Pokemon', PokemonSchema);
