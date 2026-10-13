import { z } from 'zod';

export const BRANCHES = ['CSE', 'ISE', 'AIML', 'AIDS', 'ECE', 'EEE', 'ME', 'CV', 'BT'] as const;
export const ACADEMIC_YEARS = [1, 2, 3, 4] as const;
export const GENDERS = ['Male', 'Female', 'Other'] as const;

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Please enter a valid email address.'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long.'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const signupSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('Please enter a valid email address.'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters long.')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter.')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter.')
      .regex(/[0-9]/, 'Password must contain at least one number.'),
    full_name: z
      .string()
      .trim()
      .min(2, 'Full name must be at least 2 characters.')
      .max(100, 'Full name cannot exceed 100 characters.'),
    usn: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^1NT\d{2}[A-Z]{2}\d{3}$/, 'USN must follow standard NMIT format (e.g., 1NT22CS001).'),
    phone: z
      .string()
      .trim()
      .regex(/^\+91[6-9]\d{9}$/, 'Phone number must be in +91XXXXXXXXXX format.'),
    branch: z.enum(BRANCHES, {
      message: 'Please select a valid academic branch.',
    }),
    academic_year: z.coerce
      .number()
      .int()
      .min(1)
      .max(4, 'Academic year must be between 1 and 4.'),
    sex: z.enum(GENDERS, {
      message: 'Please select your gender.',
    }),
    date_of_birth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be in YYYY-MM-DD format.')
      .refine((dobStr) => {
        const dob = new Date(dobStr);
        if (isNaN(dob.getTime())) return false;
        const cutoff = new Date();
        cutoff.setFullYear(cutoff.getFullYear() - 15);
        return dob <= cutoff;
      }, 'You must be at least 15 years old to register.'),
  });

export type SignupInput = z.infer<typeof signupSchema>;

export const verifyOtpSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Please enter a valid email address.'),
  token: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Verification code must be exactly 6 digits.'),
});

export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Please enter a valid email address.'),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters long.')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter.')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter.')
      .regex(/[0-9]/, 'Password must contain at least one number.'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
