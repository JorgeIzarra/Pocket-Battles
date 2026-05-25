import { Hono } from 'hono';
import Stripe from 'stripe';
import { requireAuth } from '../middleware/auth';
import { Subscription } from '../models/Subscription';
import type { AppEnv } from '../types';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const payments = new Hono<AppEnv>();

// POST /payments/checkout-session — crea una Stripe Checkout Session para la suscripción Premium
payments.post('/checkout-session', requireAuth, async (c) => {
  const clerkUserId = c.get('clerkUserId')!;
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
      metadata: { clerkUserId },
      success_url: 'http://localhost:3000?premium=success',
      cancel_url: 'http://localhost:3000?premium=canceled',
    });
    return c.json({ url: session.url });
  } catch (err) {
    console.error('[Stripe] checkout-session error:', err);
    return c.json({ error: 'No se pudo crear la sesión de pago' }, 500);
  }
});

// POST /payments/webhook — recibe eventos de Stripe (sin auth, valida firma)
// IMPORTANTE: lee el body con c.req.text() antes de cualquier JSON parse;
// Stripe requiere el body raw para verificar la firma HMAC.
payments.post('/webhook', async (c) => {
  const rawBody = await c.req.text();
  const sig = c.req.header('stripe-signature') ?? '';

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error('[Stripe] invalid webhook signature:', err);
    return c.json({ error: 'Invalid signature' }, 400);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const clerkUserId = session.metadata?.clerkUserId;
      if (!clerkUserId || !session.subscription) {
        return c.json({ received: true });
      }

      const subscriptionId = session.subscription as string;
      const customerId = session.customer as string;
      const sub = await stripe.subscriptions.retrieve(subscriptionId);

      await Subscription.findOneAndUpdate(
        { clerkUserId },
        {
          clerkUserId,
          status: 'active',
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          currentPeriodEnd: new Date(sub.items.data[0].current_period_end * 1000),
        },
        { upsert: true, new: true },
      );
      console.log(`[Stripe] subscription activated for ${clerkUserId}`);
    } else if (event.type === 'customer.subscription.updated') {
      const sub = event.data.object as Stripe.Subscription;
      await Subscription.findOneAndUpdate(
        { stripeSubscriptionId: sub.id },
        {
          status: sub.status as 'active' | 'canceled' | 'past_due',
          currentPeriodEnd: new Date(sub.items.data[0].current_period_end * 1000),
        },
      );
    } else if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription;
      await Subscription.findOneAndUpdate(
        { stripeSubscriptionId: sub.id },
        { status: 'canceled' },
      );
      console.log(`[Stripe] subscription canceled: ${sub.id}`);
    }
  } catch (err) {
    console.error('[Stripe] webhook handler error:', err);
    return c.json({ error: 'Webhook handler failed' }, 500);
  }

  return c.json({ received: true });
});

export default payments;
