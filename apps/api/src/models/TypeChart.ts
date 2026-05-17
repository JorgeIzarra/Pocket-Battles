import mongoose from 'mongoose';

const TypeChartSchema = new mongoose.Schema(
  { chart: mongoose.Schema.Types.Mixed },
  { collection: 'typecharts' },
);

export const TypeChart = mongoose.model('TypeChart', TypeChartSchema);
