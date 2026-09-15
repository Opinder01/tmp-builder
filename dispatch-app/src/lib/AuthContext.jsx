import { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = loading
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const lastProfileUserId = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      lastProfileUserId.current = null;
      return;
    }
    // Supabase fires onAuthStateChange (e.g. TOKEN_REFRESHED) on things like
    // the tab regaining focus — which happens constantly on mobile when a
    // worker switches to the camera app to take a timesheet photo and comes
    // back. Only show a blocking loading state for a genuine sign-in/account
    // switch, not a silent background token refresh for the same user —
    // otherwise the whole route tree below unmounts and wipes in-progress
    // form state (typed times, selected photo) whenever that fires.
    const isNewUser = lastProfileUserId.current !== session.user.id;
    if (isNewUser) setProfileLoading(true);
    supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => {
        setProfile(data);
        setProfileLoading(false);
        lastProfileUserId.current = session.user.id;
      });
  }, [session]);

  async function signOut() {
    await supabase.auth.signOut();
  }

  const value = {
    session,
    profile,
    loading: session === undefined || (session && profileLoading),
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
