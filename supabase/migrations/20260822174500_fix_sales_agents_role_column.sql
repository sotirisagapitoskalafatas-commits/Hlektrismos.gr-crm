-- Fix: add missing 'role' column to sales_agents
ALTER TABLE sales_agents ADD COLUMN IF NOT EXISTS role text DEFAULT 'sales';
