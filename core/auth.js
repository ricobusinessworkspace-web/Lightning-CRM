import { db } from './db.js';

export const auth = {
  // Passkey Registration (WebAuthn Fallback for Browser)
  registerPasskey: async () => {
    try {
      console.log('Initiating WebAuthn Passkey registration...');
      // Note: In a real Supabase setup, this requires `@supabase/supabase-js` MFA methods.
      // We simulate the native biometric intent here.
      if (!window.PublicKeyCredential) {
        throw new Error("WebAuthn is not supported on this device.");
      }
      return { success: true, message: "Passkey registered (Mock)" };
    } catch (err) {
      console.error(err);
      return { success: false, error: err.message };
    }
  },

  // Developer Unlock Bootstrapper
  unlockDeveloper: async () => {
    try {
      const user = await window.api.getCurrentUser();
      if (!user) throw new Error("Not logged in");
      
      const success = await window.api.makeMeDeveloper();
      return success;
    } catch (err) {
      console.error("Developer unlock failed:", err);
      return false;
    }
  }
};
