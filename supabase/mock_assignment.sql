-- Insert Mock Assignment
INSERT INTO public.assignments (id, title, description, duration_minutes, total_marks, passing_marks, is_active)
VALUES (
    'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d', 
    'React & Frontend Development Assessment', 
    'Test your knowledge of React hooks, state management, and basic frontend concepts. You are strictly proctored.', 
    15, 
    20, 
    10, 
    true
)
ON CONFLICT (id) DO NOTHING;

-- Insert Mock Questions
INSERT INTO public.assignment_questions (assignment_id, question_text, options, correct_option_index, marks, order_index)
VALUES 
(
    'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d', 
    'Which React hook is used to manage side effects?', 
    '["useState", "useEffect", "useContext", "useReducer"]'::jsonb, 
    1, 
    5, 
    1
),
(
    'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d', 
    'What does CSS stand for?', 
    '["Computer Style Sheets", "Creative Style System", "Cascading Style Sheets", "Colorful Style Sheets"]'::jsonb, 
    2, 
    5, 
    2
),
(
    'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d', 
    'Which of the following is NOT a JavaScript data type?', 
    '["Undefined", "Number", "Boolean", "Float"]'::jsonb, 
    3, 
    5, 
    3
),
(
    'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d', 
    'What is the Virtual DOM in React?', 
    '["A direct copy of the actual DOM", "A lightweight JavaScript representation of the DOM", "A browser extension", "A tool for debugging"]'::jsonb, 
    1, 
    5, 
    4
);
