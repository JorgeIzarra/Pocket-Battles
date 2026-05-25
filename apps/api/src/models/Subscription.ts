import mongoose, { Schema, type Document } from 'mongoose';

export interface ISubscription extends Document {
  clerkUserId: string;
  status: 'active' | 'canceled' | 'past_due';
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  currentPeriodEnd: Date;
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionSchema = new Schema<ISubscription>(
  {
    clerkUserId: { type: String, required: true, unique: true, index: true },
    status: { type: String, enum: ['active', 'canceled', 'past_due'], required: true },
    stripeCustomerId: { type: String, required: true },
    stripeSubscriptionId: { type: String, required: true },
    currentPeriodEnd: { type: Date, required: true },
  },
  { timestamps: true },
);

export const Subscription = mongoose.model<ISubscription>('Subscription', subscriptionSchema);
