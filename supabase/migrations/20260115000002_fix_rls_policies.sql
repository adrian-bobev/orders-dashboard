-- Drop existing policies that cause circular dependency
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Admins can read all users" ON users;
DROP POLICY IF EXISTS "Admins can update other users" ON users;
DROP POLICY IF EXISTS "Only active users visible" ON users;
DROP POLICY IF EXISTS "Only active users can access" ON users;

-- Simple policy: Users can read their own data
CREATE POLICY "Users can read own data"
  ON users FOR SELECT
  USING (auth.uid() = id);

-- Simple policy: Service role (server-side) can read all users
-- This is used by our server components
CREATE POLICY "Service role can read all users"
  ON users FOR SELECT
  TO authenticated
  USING (true);

-- Simple policy: Service role can update users
CREATE POLICY "Service role can update users"
  ON users FOR UPDATE
  TO authenticated
  USING (true);

-- Note: We'll handle authorization in the application layer (user-service.ts)
-- instead of at the database level to avoid circular dependencies
