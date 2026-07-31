-- Create Assignments Table
CREATE TABLE IF NOT EXISTS public.assignments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    total_marks INTEGER NOT NULL,
    passing_marks INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create Assignment Questions Table
CREATE TABLE IF NOT EXISTS public.assignment_questions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    assignment_id UUID REFERENCES public.assignments(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    options JSONB NOT NULL, -- Array of string options
    correct_option_index INTEGER NOT NULL,
    marks INTEGER NOT NULL DEFAULT 1,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create Assignment Submissions Table
CREATE TABLE IF NOT EXISTS public.assignment_submissions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    assignment_id UUID REFERENCES public.assignments(id) ON DELETE CASCADE,
    student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    answers JSONB, -- Map of question_id -> selected_option_index
    score INTEGER NOT NULL DEFAULT 0,
    is_passed BOOLEAN NOT NULL DEFAULT false,
    warnings_received INTEGER DEFAULT 0,
    cheating_detected BOOLEAN DEFAULT false,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(assignment_id, student_id) -- A student can only submit an assignment once
);

-- Enable RLS
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_submissions ENABLE ROW LEVEL SECURITY;

-- Policies for Assignments
-- Admins can do everything
CREATE POLICY "Admins can manage assignments" ON public.assignments
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles 
            WHERE user_roles.user_id = auth.uid() 
            AND role IN ('admin', 'super_admin')
        )
    );

-- Anyone authenticated can view active assignments
CREATE POLICY "Anyone can view active assignments" ON public.assignments
    FOR SELECT TO authenticated
    USING (is_active = true);


-- Policies for Assignment Questions
CREATE POLICY "Admins can manage questions" ON public.assignment_questions
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles 
            WHERE user_roles.user_id = auth.uid() 
            AND role IN ('admin', 'super_admin')
        )
    );

-- Authenticated users can view questions for active assignments
CREATE POLICY "Anyone can view questions" ON public.assignment_questions
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.assignments 
            WHERE assignments.id = assignment_questions.assignment_id 
            AND assignments.is_active = true
        )
    );


-- Policies for Submissions
CREATE POLICY "Admins can view all submissions" ON public.assignment_submissions
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles 
            WHERE user_roles.user_id = auth.uid() 
            AND role IN ('admin', 'super_admin')
        )
    );

CREATE POLICY "Students can view their own submissions" ON public.assignment_submissions
    FOR SELECT TO authenticated
    USING (auth.uid() = student_id);

CREATE POLICY "Students can insert their own submissions" ON public.assignment_submissions
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = student_id);
