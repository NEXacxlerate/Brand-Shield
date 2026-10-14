import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { SavedItem } from '../types';
import { listItems, createItem, deleteItem, fetchItemImage, uploadLegacyGuestItems, type NewItem } from '../lib/items';

interface CollectionsContextValue {
    items: SavedItem[];
    loading: boolean;
    error: string | null;
    saveItem: (item: NewItem) => Promise<void>;
    removeItem: (id: string) => Promise<void>;
    syncLocalToCloud: () => Promise<void>;
    reload: () => Promise<void>;
}

const CollectionsContext = createContext<CollectionsContextValue | undefined>(undefined);

export const CollectionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const [items, setItems] = useState<SavedItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    // item id -> object URL of its picture (fetched with the Authorization header)
    const blobUrls = useRef<Map<string, string>>(new Map());

    const withPictures = useCallback(async (list: SavedItem[]): Promise<SavedItem[]> => {
        return Promise.all(list.map(async (it) => {
            if (!it.url) return it;
            let obj = blobUrls.current.get(it.id);
            if (!obj) {
                try {
                    obj = URL.createObjectURL(await fetchItemImage(it.url));
                    blobUrls.current.set(it.id, obj);
                } catch {
                    return { ...it, url: undefined };
                }
            }
            return { ...it, url: obj };
        }));
    }, []);

    const reload = useCallback(async () => {
        if (!user) return;
        try {
            const res = await listItems({ limit: 500 });
            setItems(await withPictures(res.items));
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not load your saved items.');
        } finally {
            setLoading(false);
        }
    }, [user, withPictures]);

    useEffect(() => {
        if (!user) { setLoading(false); return; }
        setLoading(true);
        void reload();
    }, [user, reload]);

    useEffect(() => {
        const urls = blobUrls.current;
        return () => { urls.forEach((u) => URL.revokeObjectURL(u)); urls.clear(); };
    }, []);

    const saveItem = useCallback(async (baseItem: NewItem) => {
        await createItem(baseItem); // throws with a plain message on failure; callers show it
        await reload();
    }, [reload]);

    const removeItem = useCallback(async (id: string) => {
        await deleteItem(id);
        const u = blobUrls.current.get(id);
        if (u) { URL.revokeObjectURL(u); blobUrls.current.delete(id); }
        setItems((prev) => prev.filter((i) => i.id !== id));
    }, []);

    // Items the old standalone Studio kept in this browser are uploaded once after sign-in.
    const syncLocalToCloud = useCallback(async () => {
        if (!user) return;
        if ((await uploadLegacyGuestItems()) > 0) await reload();
    }, [user, reload]);

    return (
        <CollectionsContext.Provider value={{ items, loading, error, saveItem, removeItem, syncLocalToCloud, reload }}>
            {children}
        </CollectionsContext.Provider>
    );
};

export const useCollections = () => {
    const context = useContext(CollectionsContext);
    if (!context) throw new Error('useCollections must be used within CollectionsProvider');
    return context;
};
