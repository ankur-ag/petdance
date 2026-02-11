/**
 * PetDance API - Cloud Functions integration
 * Handles job creation, image upload, AI processing, and downloads
 */

const API = {
    async getAuthToken() {
        const user = window.firebaseAuth?.currentUser;
        if (!user) throw new Error('Not authenticated');
        return user.getIdToken();
    },

    async createJob(danceStyle) {
        const token = await this.getAuthToken();
        const base = window.FUNCTIONS_BASE;
        const res = await fetch(`${base}/createJob`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ danceStyle }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create job');
        return data;
    },

    async uploadImage(uploadUrl, file) {
        const res = await fetch(uploadUrl, {
            method: 'PUT',
            body: file,
            headers: {
                'Content-Type': file.type || 'image/jpeg',
            },
        });
        if (!res.ok) throw new Error('Failed to upload image');
    },

    async startJob(jobId) {
        const token = await this.getAuthToken();
        const base = window.FUNCTIONS_BASE;
        const res = await fetch(`${base}/startJob`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ jobId }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to start job');
        return data;
    },

    async getJobStatus(jobId) {
        const token = await this.getAuthToken();
        const base = window.FUNCTIONS_BASE;
        const res = await fetch(`${base}/getJobStatus?jobId=${encodeURIComponent(jobId)}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` },
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to get status');
        return data;
    },

    subscribeToJob(jobId, onUpdate) {
        const db = window.firebaseDb;
        if (!db) {
            console.warn('Firestore not initialized - falling back to polling');
            return () => {};
        }

        const unsubscribe = db.collection('jobs').doc(jobId).onSnapshot(
            (snap) => {
                if (snap.exists) {
                    onUpdate({ id: snap.id, ...snap.data() });
                }
            },
            (err) => console.error('Job listener error:', err)
        );

        return unsubscribe;
    },

    async getDownloadUrl(jobId) {
        const token = await this.getAuthToken();
        const base = window.FUNCTIONS_BASE;
        const res = await fetch(`${base}/getDownloadUrl`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ jobId }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to get download URL');
        return data.downloadUrl;
    },
};

window.PetDanceAPI = API;
