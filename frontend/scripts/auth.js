/* Initialize Supabase client and authentication functions for GetItDone */

/* Supabase configuration */
const SUPABASE_URL = 'https://bwfnvnyugmxglbsbjrsx.supabase.co'; /*  Supabase project URL */
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3Zm52bnl1Z214Z2xic2JqcnN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQyMTk4NzksImV4cCI6MjA2OTc5NTg3OX0.UbK_gJ4QQjcCAjnssL6E_1ngACQvQYWSlQ5DN6_kxE4'; /* Replace with your Supabase anon key */

/* Initialize Supabase client */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


/* Sign up a new user with email and password */
async function signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            emailRedirectTo: window.location.origin /* Redirect to app after email confirmation */
        }
    });
    if (error) throw new Error(error.message);
    return data;
}

/* Sign in an existing user with email and password */
async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });
    if (error) throw new Error(error.message);
    return data;
}

/* Sign out the current user */
async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
}

/* Get the current user session */
async function getSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new Error(error.message);
    return data.session;
}

/* Send password reset email */
async function resetPassword(email) {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin /* Redirect to app after reset */
    });
    if (error) throw new Error(error.message);
    return data;
}

/* Export Supabase client and auth functions for use in app.js */
export { signUp, signIn, signOut, getSession, resetPassword };