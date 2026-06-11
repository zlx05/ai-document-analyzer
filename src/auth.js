import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const tokenSecret = process.env.JWT_SECRET || 'dev-only-change-me';

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    },
    tokenSecret,
    { expiresIn: '7d' }
  );
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!token) {
    return res.status(401).json({ message: 'Missing auth token' });
  }

  try {
    req.user = jwt.verify(token, tokenSecret);
    next();
  } catch (_error) {
    res.status(401).json({ message: 'Invalid or expired auth token' });
  }
}
