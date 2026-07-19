-- Migration: Notifications Table für Lightning CRM

CREATE TABLE IF NOT EXISTS public.crm_notifications (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'message', 'snooze', 'task'
    lead_id BIGINT REFERENCES public.crm_leads(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS (Row Level Security)
ALTER TABLE public.crm_notifications ENABLE ROW LEVEL SECURITY;

-- Policy: User can only see their own notifications
CREATE POLICY "Users can view their own notifications"
ON public.crm_notifications FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Anyone logged in can insert a notification (so dev/admin can send to agent, system can create snoozes)
CREATE POLICY "Logged in users can insert notifications"
ON public.crm_notifications FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- Policy: User can update (mark as read) their own notifications
CREATE POLICY "Users can update their own notifications"
ON public.crm_notifications FOR UPDATE
USING (auth.uid() = user_id);

-- Policy: User can delete their own notifications
CREATE POLICY "Users can delete their own notifications"
ON public.crm_notifications FOR DELETE
USING (auth.uid() = user_id);

-- Add Realtime support
ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_notifications;
