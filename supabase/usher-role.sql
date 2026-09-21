-- Apply this statement on its own before ministry-operations.sql.
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'usher';
