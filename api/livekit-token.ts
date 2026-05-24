import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AccessToken } from 'livekit-server-sdk';
import { createClient } from '@supabase/supabase-js';
import { randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Issues a short-lived LiveKit JWT to either a web client (Supabase-authenticated)
 * or the Android driver (shared bearer secret).
 *
 * Request body:
 *   { kind: 'web' }                          + Authorization: Bearer <supabase_access_token>
 *   { kind: 'driver', driverId: 'string' }   + Authorization: Bearer <DRIVER_SHARED_SECRET>
 *
 * Response: { token, url, room, canPublish, identity }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS: Vite dev server runs on a different origin during development
  res.setHeader('Access-Control-Allow-Origin', (req.headers.origin as string | undefined) ?? '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  // Reuse VITE_LIVEKIT_URL — Vercel exposes all env vars to functions, and the URL
  // is the same value the client needs.
  const liveKitUrl = process.env.VITE_LIVEKIT_URL;
  const roomName = 'vera-team-voice';
  if (!apiKey || !apiSecret || !liveKitUrl) {
    return res.status(500).json({ error: 'LiveKit env vars missing on server' });
  }

  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) ?? {};
  const kind = body.kind;
  const authHeader = (req.headers.authorization ?? '') as string;
  const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();

  let identity: string;
  let name: string;
  let canPublish: boolean;

  try {
    if (kind === 'driver') {
      const expected = process.env.DRIVER_SHARED_SECRET;
      if (!expected) {
        return res.status(500).json({ error: 'Driver secret not configured on server' });
      }
      const a = Buffer.from(bearer);
      const b = Buffer.from(expected);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return res.status(401).json({ error: 'Invalid driver secret' });
      }
      const driverId = String(body.driverId ?? 'driver').slice(0, 64).replace(/[^a-zA-Z0-9_-]/g, '');
      identity = `driver-${driverId || 'driver'}`;
      name = 'Driver';
      canPublish = true;
    } else if (kind === 'web') {
      // Open-access mode: anyone can join and publish for now.
      // If the caller is signed in to Supabase we use their email as the display
      // name; otherwise they connect as a random anonymous guest. We do NOT
      // gate publish — that will come back when we have viewer accounts.
      let displayName = `Guest-${randomBytes(2).toString('hex')}`;
      let userIdentity = `web-anon-${randomBytes(4).toString('hex')}`;

      if (bearer) {
        const supabaseUrl = process.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        if (supabaseUrl && supabaseAnonKey) {
          try {
            const supabase = createClient(supabaseUrl, supabaseAnonKey, {
              global: { headers: { Authorization: `Bearer ${bearer}` } },
            });
            const { data: userData } = await supabase.auth.getUser(bearer);
            if (userData?.user) {
              userIdentity = `web-${userData.user.id}`;
              displayName = userData.user.email?.split('@')[0] ?? displayName;
            }
          } catch {
            // Fall through to anonymous identity
          }
        }
      }

      identity = userIdentity;
      name = displayName;
      canPublish = true;
    } else {
      return res.status(400).json({ error: "Invalid 'kind' — must be 'web' or 'driver'" });
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      name,
      ttl: 6 * 60 * 60, // 6 hours
    });
    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish,
      canSubscribe: true,
      canPublishData: false,
      canUpdateOwnMetadata: false,
      hidden: false,
    });
    const token = await at.toJwt();

    return res.status(200).json({
      token,
      url: liveKitUrl,
      room: roomName,
      canPublish,
      identity,
    });
  } catch (err) {
    console.error('Token issuance failed:', err);
    return res.status(500).json({ error: 'Token issuance failed' });
  }
}
