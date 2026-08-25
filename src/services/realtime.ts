import { db } from '@/lib/firebase';
import { ref, get, onValue, DataSnapshot, set, update, push, runTransaction, query, orderByChild, equalTo } from 'firebase/database';
import type { Device, Alert } from '@/types/device';
import type { EcoCollectionRequest, EcoRewardStatus, EcoRewardTransaction, EcoWallet, WasteType } from '@/types/rewards';
import { ECO_POINT_RATES } from '@/types/rewards';

function snapshotToArray<T extends { id: string }>(snapshot: DataSnapshot): T[] {
  const val = snapshot.val();
  if (!val) return [];
  if (Array.isArray(val)) {
    return (val.filter(Boolean) as any[]).map((item, idx) => ({ id: item.id ?? String(idx), ...item }));
  }
  return Object.keys(val).map((key) => ({ id: key, ...val[key] }));
}

export async function fetchDevices(ownerId?: string): Promise<Device[]> {
  const targetPath = ownerId ? `devices/${ownerId}` : 'devices';
  const snap = await get(ref(db, targetPath));

  if (!snap.exists()) return [];
  const val = snap.val();

  let rawItems: any[] = [];
  if (ownerId) {
    // Single user structure: { "001": {...}, "002": {...} }
    rawItems = Object.keys(val).map(id => ({
      id,
      ...val[id],
      ownerId: val[id].ownerId || ownerId
    }));
  } else {
    // Admin/Global structure: { "UID1": { "001": {...} }, "UID2": {...} }
    Object.keys(val).forEach(uid => {
      const userDevices = val[uid];
      if (userDevices && typeof userDevices === 'object') {
        // Skip legacy flat-structure entries: if it has 'id' or 'binPercentage', it's a device, not a user node
        if ('id' in userDevices || 'binPercentage' in userDevices) return;

        Object.keys(userDevices).forEach(did => {
          rawItems.push({
            id: did,
            ...userDevices[did],
            ownerId: userDevices[did].ownerId || uid
          });
        });
      }
    });
  }

  return rawItems.map((d: any) => ({
    id: String(d.id),
    binPercentage: Number(d.binPercentage ?? 0),
    isFull: Boolean(d.isFull ?? (Number(d.binPercentage ?? 0) >= 100)),
    latitude: Number(d.latitude ?? 0),
    longitude: Number(d.longitude ?? 0),
    altitude: d.altitude !== undefined ? Number(d.altitude) : undefined,
    tamperDetected: Boolean(d.tamperDetected ?? false),
    batteryLevel: Number(d.batteryLevel ?? 0),
    batteryVoltage: Number(d.batteryVoltage ?? 0),
    timestamp: String(d.timestamp ?? new Date().toISOString()),
    gpsTime: d.gpsTime ? String(d.gpsTime) : undefined,
    message: d.message ? String(d.message) : undefined,
    wakeupReason: Number(d.wakeupReason ?? 0),
    bootCount: Number(d.bootCount ?? 0),
    randomValue: d.randomValue !== undefined ? Number(d.randomValue) : undefined,
    status: (d.status as Device['status']) ?? 'online',
    name: d.name,
    type: d.type,
    location: d.location,
    ownerId: d.ownerId,
    ownerEmail: d.ownerEmail,
  }));
}

export async function fetchAlerts(ownerId?: string): Promise<Alert[]> {
  const dbRef = ref(db, 'alerts');
  const q = ownerId
    ? query(dbRef, orderByChild('ownerId'), equalTo(ownerId))
    : dbRef;

  const snap = await get(q);
  const items = snapshotToArray<any>(snap);
  return items.map((a: any) => ({
    id: String(a.id),
    deviceId: String(a.deviceId ?? a.deviceId),
    ownerId: a.ownerId,
    type: (a.type as Alert['type']) ?? 'full',
    binPercentage: Number(a.binPercentage ?? 0),
    isFull: Boolean(a.isFull ?? (Number(a.binPercentage ?? 0) >= 100)),
    timestamp: String(a.timestamp ?? new Date().toISOString()),
    message: String(a.message ?? ''),
    acknowledged: Boolean(a.acknowledged ?? false),
  }));
}

export function subscribeDevices(onDevices: (devices: Device[]) => void, ownerId?: string) {
  const targetPath = ownerId ? `devices/${ownerId}` : 'devices';
  const dbRef = ref(db, targetPath);

  return onValue(dbRef, (snapshot) => {
    if (!snapshot.exists()) {
      onDevices([]);
      return;
    }
    const val = snapshot.val();
    let rawItems: any[] = [];

    if (ownerId) {
      rawItems = Object.keys(val).map(id => ({
        id,
        ...val[id],
        ownerId: val[id].ownerId || ownerId
      }));
    } else {
      Object.keys(val).forEach(uid => {
        const userDevices = val[uid];
        if (userDevices && typeof userDevices === 'object') {
          // Skip legacy flat-structure entries
          if ('id' in userDevices || 'binPercentage' in userDevices) return;

          Object.keys(userDevices).forEach(did => {
            rawItems.push({
              id: did,
              ...userDevices[did],
              ownerId: userDevices[did].ownerId || uid
            });
          });
        }
      });
    }

    onDevices(rawItems.map((d: any) => ({
      id: String(d.id),
      binPercentage: Number(d.binPercentage ?? 0),
      isFull: Boolean(d.isFull ?? (Number(d.binPercentage ?? 0) >= 100)),
      latitude: Number(d.latitude ?? 0),
      longitude: Number(d.longitude ?? 0),
      altitude: d.altitude !== undefined ? Number(d.altitude) : undefined,
      tamperDetected: Boolean(d.tamperDetected ?? false),
      batteryLevel: Number(d.batteryLevel ?? 0),
      batteryVoltage: Number(d.batteryVoltage ?? 0),
      timestamp: String(d.timestamp ?? new Date().toISOString()),
      gpsTime: d.gpsTime ? String(d.gpsTime) : undefined,
      message: d.message ? String(d.message) : undefined,
      wakeupReason: Number(d.wakeupReason ?? 0),
      bootCount: Number(d.bootCount ?? 0),
      randomValue: d.randomValue !== undefined ? Number(d.randomValue) : undefined,
      status: (d.status as Device['status']) ?? 'online',
      name: d.name,
      type: d.type,
      location: d.location,
      ownerId: d.ownerId,
      ownerEmail: d.ownerEmail,
    })));
  });
}

export function subscribeAlerts(onAlerts: (alerts: Alert[]) => void, ownerId?: string) {
  const alertsRef = ref(db, 'alerts');
  const q = ownerId
    ? query(alertsRef, orderByChild('ownerId'), equalTo(ownerId))
    : alertsRef;

  return onValue(q, (snapshot) => {
    const items = snapshotToArray<any>(snapshot);
    onAlerts(items.map((a: any) => ({
      id: String(a.id),
      deviceId: String(a.deviceId ?? a.deviceId),
      ownerId: a.ownerId,
      type: (a.type as Alert['type']) ?? 'full',
      binPercentage: Number(a.binPercentage ?? 0),
      isFull: Boolean(a.isFull ?? (Number(a.binPercentage ?? 0) >= 100)),
      timestamp: String(a.timestamp ?? new Date().toISOString()),
      message: String(a.message ?? ''),
      acknowledged: Boolean(a.acknowledged ?? false),
    })));
  });
}

export function subscribeEvents(onEvents: (events: any[]) => void) {
  const eventsRef = ref(db, 'events');
  return onValue(eventsRef, (snapshot) => {
    const items = snapshotToArray<any>(snapshot);
    onEvents(items.map((e: any) => ({
      id: String(e.id),
      deviceId: String(e.deviceId),
      eventType: String(e.eventType),
      previousValue: e.previousValue,
      newValue: e.newValue,
      timestamp: String(e.timestamp ?? new Date().toISOString()),
    })));
  });
}

export async function fetchDeviceById(id: string, ownerId?: string): Promise<Device | null> {
  if (!ownerId) {
    // Fallback: scan list if ownerId is not known (Admin view)
    const all = await fetchDevices();
    return all.find(x => x.id === id) ?? null;
  }

  const snap = await get(ref(db, `devices/${ownerId}/${id}`));
  if (snap.exists()) {
    const d: any = snap.val();
    return {
      id: String(id),
      binPercentage: Number(d.binPercentage ?? 0),
      isFull: Boolean(d.isFull ?? (Number(d.binPercentage ?? 0) >= 100)),
      latitude: Number(d.latitude ?? 0),
      longitude: Number(d.longitude ?? 0),
      altitude: d.altitude !== undefined ? Number(d.altitude) : undefined,
      tamperDetected: Boolean(d.tamperDetected ?? false),
      batteryLevel: Number(d.batteryLevel ?? 0),
      batteryVoltage: Number(d.batteryVoltage ?? 0),
      timestamp: String(d.timestamp ?? new Date().toISOString()),
      gpsTime: d.gpsTime ? String(d.gpsTime) : undefined,
      message: d.message ? String(d.message) : undefined,
      wakeupReason: Number(d.wakeupReason ?? 0),
      bootCount: Number(d.bootCount ?? 0),
      randomValue: d.randomValue !== undefined ? Number(d.randomValue) : undefined,
      status: (d.status as Device['status']) ?? 'online',
      name: d.name,
      type: d.type,
      location: d.location,
      ownerId: d.ownerId || ownerId,
      ownerEmail: d.ownerEmail,
    };
  }
  return null;
}

export function subscribeDevice(id: string, onDevice: (device: Device | null) => void, ownerId?: string) {
  if (!ownerId) {
    onDevice(null);
    return () => { };
  }
  const deviceRef = ref(db, `devices/${ownerId}/${id}`);
  return onValue(deviceRef, (snapshot) => {
    if (!snapshot.exists()) {
      onDevice(null);
      return;
    }
    const d: any = snapshot.val();
    onDevice({
      id: String(id),
      binPercentage: Number(d.binPercentage ?? 0),
      isFull: Boolean(d.isFull ?? (Number(d.binPercentage ?? 0) >= 100)),
      latitude: Number(d.latitude ?? 0),
      longitude: Number(d.longitude ?? 0),
      altitude: d.altitude !== undefined ? Number(d.altitude) : undefined,
      tamperDetected: Boolean(d.tamperDetected ?? false),
      batteryLevel: Number(d.batteryLevel ?? 0),
      batteryVoltage: Number(d.batteryVoltage ?? 0),
      timestamp: String(d.timestamp ?? new Date().toISOString()),
      gpsTime: d.gpsTime ? String(d.gpsTime) : undefined,
      message: d.message ? String(d.message) : undefined,
      wakeupReason: Number(d.wakeupReason ?? 0),
      bootCount: Number(d.bootCount ?? 0),
      randomValue: d.randomValue !== undefined ? Number(d.randomValue) : undefined,
      status: (d.status as Device['status']) ?? 'online',
      name: d.name,
      type: d.type,
      location: d.location,
      ownerId: d.ownerId || ownerId,
      ownerEmail: d.ownerEmail,
    });
  });
}

export async function createDevice(input: {
  name?: string;
  type?: string;
  location?: string;
  ownerId: string;
  ownerEmail?: string;
  latitude?: number;
  longitude?: number;
  binPercentage?: number;
  batteryLevel?: number;
}) {
  const { ownerId } = input;
  if (!ownerId) throw new Error('Owner ID is required');

  // Generate Auto ID (001, 002, ...)
  const userDevicesRef = ref(db, `devices/${ownerId}`);
  const snap = await get(userDevicesRef);
  const count = snap.exists() ? Object.keys(snap.val()).length : 0;
  const deviceId = (count + 1).toString().padStart(3, '0');

  const lat = Number(input.latitude ?? 0);
  const lng = Number(input.longitude ?? 0);
  const now = new Date().toISOString();
  const bin = Number(input.binPercentage ?? 0);
  const battery = Number(input.batteryLevel ?? 100);

  const payload = {
    id: deviceId,
    name: input.name ?? `Bin ${deviceId}`,
    type: input.type ?? 'Smart Bin',
    location: input.location ?? '',
    ownerId: ownerId,
    ownerEmail: input.ownerEmail ?? '',
    binPercentage: bin,
    isFull: bin >= 100,
    latitude: lat,
    longitude: lng,
    altitude: null,
    tamperDetected: false,
    batteryLevel: battery,
    batteryVoltage: 0,
    timestamp: now,
    wakeupReason: 0,
    bootCount: 0,
    status: 'online',
  } as const;

  await set(ref(db, `devices/${ownerId}/${deviceId}`), payload);
  return {
    ...payload,
    altitude: undefined,
    gpsTime: undefined,
    message: undefined,
    randomValue: undefined,
    status: 'online' as Device['status'],
  } as Device;
}


const EMPTY_ECO_WALLET: EcoWallet = {
  pointsBalance: 0,
  pendingPoints: 0,
  lifetimePoints: 0,
  totalKg: 0,
  totalCollections: 0,
  plasticKg: 0,
  aluminiumKg: 0,
  paperKg: 0,
  otherKg: 0,
};

function normaliseEcoWallet(value: Partial<EcoWallet> | null | undefined): EcoWallet {
  return {
    ...EMPTY_ECO_WALLET,
    ...(value ?? {}),
  };
}

function ecoRewardFromValue(id: string, value: Record<string, unknown>): EcoRewardTransaction {
  return {
    id,
    uid: String(value.uid ?? ''),
    deviceId: String(value.deviceId ?? ''),
    deviceName: value.deviceName ? String(value.deviceName) : undefined,
    wasteType: (value.wasteType as WasteType) ?? 'other',
    estimatedKg: Number(value.estimatedKg ?? 0),
    verifiedKg: value.verifiedKg !== undefined ? Number(value.verifiedKg) : undefined,
    points: Number(value.points ?? 0),
    verifiedPoints: value.verifiedPoints !== undefined ? Number(value.verifiedPoints) : undefined,
    status: (value.status as EcoRewardTransaction['status']) ?? 'claimed',
    collectionStatus: (value.collectionStatus as EcoRewardTransaction['collectionStatus']) ?? 'not_requested',
    requestId: value.requestId ? String(value.requestId) : undefined,
    createdAt: String(value.createdAt ?? new Date().toISOString()),
    verifiedAt: value.verifiedAt ? String(value.verifiedAt) : undefined,
  };
}

function ecoCollectionFromValue(id: string, value: Record<string, unknown>): EcoCollectionRequest {
  return {
    id,
    uid: String(value.uid ?? ''),
    email: value.email ? String(value.email) : undefined,
    type: 'eco_reward_pickup',
    rewardId: String(value.rewardId ?? ''),
    deviceId: String(value.deviceId ?? ''),
    deviceName: value.deviceName ? String(value.deviceName) : undefined,
    status: (value.status as EcoCollectionRequest['status']) ?? 'pending',
    timestamp: Number(value.timestamp ?? Date.now()),
    updatedAt: value.updatedAt !== undefined ? Number(value.updatedAt) : undefined,
  };
}

export async function fetchEcoWallet(uid: string): Promise<EcoWallet> {
  if (!uid) return EMPTY_ECO_WALLET;
  const snap = await get(ref(db, `ecoRewards/wallets/${uid}`));
  return normaliseEcoWallet(snap.exists() ? snap.val() : null);
}

export function subscribeEcoWallet(uid: string, onWallet: (wallet: EcoWallet) => void) {
  if (!uid) {
    onWallet(EMPTY_ECO_WALLET);
    return () => undefined;
  }
  return onValue(ref(db, `ecoRewards/wallets/${uid}`), (snapshot) => {
    onWallet(normaliseEcoWallet(snapshot.exists() ? snapshot.val() : null));
  });
}

export async function fetchEcoRewards(uid: string): Promise<EcoRewardTransaction[]> {
  if (!uid) return [];
  const snap = await get(ref(db, `ecoRewards/transactions/${uid}`));
  if (!snap.exists()) return [];
  const value = snap.val() as Record<string, Record<string, unknown>>;
  return Object.entries(value)
    .map(([id, item]) => ecoRewardFromValue(id, item))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function subscribeEcoRewards(uid: string, onRewards: (rewards: EcoRewardTransaction[]) => void) {
  if (!uid) {
    onRewards([]);
    return () => undefined;
  }
  return onValue(ref(db, `ecoRewards/transactions/${uid}`), (snapshot) => {
    if (!snapshot.exists()) {
      onRewards([]);
      return;
    }
    const value = snapshot.val() as Record<string, Record<string, unknown>>;
    onRewards(Object.entries(value)
      .map(([id, item]) => ecoRewardFromValue(id, item))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  });
}

export async function fetchEcoCollectionRequests(uid?: string): Promise<EcoCollectionRequest[]> {
  const requestsRef = ref(db, 'requests');
  const requestQuery = uid ? query(requestsRef, orderByChild('uid'), equalTo(uid)) : requestsRef;
  const snap = await get(requestQuery);
  if (!snap.exists()) return [];
  const value = snap.val() as Record<string, Record<string, unknown>>;
  return Object.entries(value)
    .map(([id, item]) => ecoCollectionFromValue(id, item))
    .filter((request) => request.type === 'eco_reward_pickup')
    .sort((a, b) => b.timestamp - a.timestamp);
}

export function subscribeEcoCollectionRequests(uid: string, onRequests: (requests: EcoCollectionRequest[]) => void) {
  if (!uid) {
    onRequests([]);
    return () => undefined;
  }
  return onValue(query(ref(db, 'requests'), orderByChild('uid'), equalTo(uid)), (snapshot) => {
    if (!snapshot.exists()) {
      onRequests([]);
      return;
    }
    const value = snapshot.val() as Record<string, Record<string, unknown>>;
    onRequests(Object.entries(value)
      .map(([id, item]) => ecoCollectionFromValue(id, item))
      .filter((request) => request.type === 'eco_reward_pickup')
      .sort((a, b) => b.timestamp - a.timestamp));
  });
}

export function calculateEcoRewardPoints(wasteType: WasteType, estimatedKg: number) {
  return Math.max(0, Math.round(Math.max(0, estimatedKg) * ECO_POINT_RATES[wasteType]));
}

export async function claimEcoReward(input: {
  uid: string;
  deviceId: string;
  deviceName?: string;
  wasteType: WasteType;
  estimatedKg: number;
}) {
  const rewardId = push(ref(db, `ecoRewards/transactions/${input.uid}`)).key;
  if (!rewardId) throw new Error('Unable to create reward ID');

  const points = calculateEcoRewardPoints(input.wasteType, input.estimatedKg);
  const createdAt = new Date().toISOString();
  const reward: EcoRewardTransaction = {
    id: rewardId,
    uid: input.uid,
    deviceId: input.deviceId,
    deviceName: input.deviceName,
    wasteType: input.wasteType,
    estimatedKg: input.estimatedKg,
    points,
    status: 'claimed',
    collectionStatus: 'not_requested',
    createdAt,
  };

  await set(ref(db, `ecoRewards/transactions/${input.uid}/${rewardId}`), reward);
  await runTransaction(ref(db, `ecoRewards/wallets/${input.uid}`), (current) => {
    const wallet = normaliseEcoWallet(current as Partial<EcoWallet> | null);
    return {
      ...wallet,
      pendingPoints: wallet.pendingPoints + points,
      updatedAt: createdAt,
    };
  });
  return reward;
}

export async function requestEcoCollection(input: {
  uid: string;
  email?: string;
  reward: EcoRewardTransaction;
}) {
  if (input.reward.requestId) return input.reward.requestId;
  const requestId = push(ref(db, 'requests')).key;
  if (!requestId) throw new Error('Unable to create collection request ID');

  const now = Date.now();
  const request: EcoCollectionRequest = {
    id: requestId,
    uid: input.uid,
    email: input.email,
    type: 'eco_reward_pickup',
    rewardId: input.reward.id,
    deviceId: input.reward.deviceId,
    deviceName: input.reward.deviceName,
    status: 'pending',
    timestamp: now,
    updatedAt: now,
  };

  await set(ref(db, `requests/${requestId}`), request);
  await update(ref(db, `ecoRewards/transactions/${input.uid}/${input.reward.id}`), {
    status: 'pickup_requested',
    collectionStatus: 'pending',
    requestId,
  });
  return request;
}

export async function updateEcoCollectionStatus(requestId: string, status: EcoCollectionRequest['status']) {
  const requestSnap = await get(ref(db, `requests/${requestId}`));
  if (!requestSnap.exists()) throw new Error('Collection request not found');
  const request = requestSnap.val() as EcoCollectionRequest;
  const updates: Record<string, unknown> = {
    [`requests/${requestId}/status`]: status,
    [`requests/${requestId}/updatedAt`]: Date.now(),
    [`ecoRewards/transactions/${request.uid}/${request.rewardId}/collectionStatus`]: status,
  };
  if (status === 'collected') {
    updates[`ecoRewards/transactions/${request.uid}/${request.rewardId}/status`] = 'collected';
  }
  await update(ref(db), updates);
}

export async function verifyEcoReward(uid: string, rewardId: string, verifiedKg?: number) {
  const rewardRef = ref(db, `ecoRewards/transactions/${uid}/${rewardId}`);
  const rewardSnap = await get(rewardRef);
  if (!rewardSnap.exists()) throw new Error('Reward claim not found');
  const reward = ecoRewardFromValue(rewardId, rewardSnap.val() as Record<string, unknown>);
  if (reward.status === 'verified') return reward;

  const finalKg = Math.max(0, verifiedKg ?? reward.estimatedKg);
  const finalPoints = calculateEcoRewardPoints(reward.wasteType, finalKg);
  const now = new Date().toISOString();
  await runTransaction(ref(db, `ecoRewards/wallets/${uid}`), (current) => {
    const wallet = normaliseEcoWallet(current as Partial<EcoWallet> | null);
    const wasteKey = `${reward.wasteType}Kg` as keyof Pick<EcoWallet, 'plasticKg' | 'aluminiumKg' | 'paperKg' | 'otherKg'>;
    return {
      ...wallet,
      pointsBalance: wallet.pointsBalance + finalPoints,
      pendingPoints: Math.max(0, wallet.pendingPoints - reward.points),
      lifetimePoints: wallet.lifetimePoints + finalPoints,
      totalKg: wallet.totalKg + finalKg,
      totalCollections: wallet.totalCollections + 1,
      [wasteKey]: Number(wallet[wasteKey] ?? 0) + finalKg,
      updatedAt: now,
    };
  });

  const updates: Record<string, unknown> = {
    status: 'verified' as EcoRewardStatus,
    collectionStatus: 'verified',
    verifiedKg: finalKg,
    verifiedPoints: finalPoints,
    verifiedAt: now,
  };
  await update(rewardRef, updates);
  if (reward.requestId) {
    await update(ref(db, `requests/${reward.requestId}`), {
      status: 'verified',
      updatedAt: Date.now(),
    });
  }
  return { ...reward, ...updates } as EcoRewardTransaction;
}
