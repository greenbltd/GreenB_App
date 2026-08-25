export type WasteType = 'plastic' | 'aluminium' | 'paper' | 'other';

export type EcoRewardStatus = 'claimed' | 'pickup_requested' | 'collected' | 'verified';
export type CollectionStatus = 'not_requested' | 'pending' | 'assigned' | 'en_route' | 'collected' | 'verified';

export interface EcoWallet {
  pointsBalance: number;
  pendingPoints: number;
  lifetimePoints: number;
  totalKg: number;
  totalCollections: number;
  plasticKg: number;
  aluminiumKg: number;
  paperKg: number;
  otherKg: number;
  updatedAt?: string;
}

export interface EcoRewardTransaction {
  id: string;
  uid: string;
  deviceId: string;
  deviceName?: string;
  wasteType: WasteType;
  estimatedKg: number;
  verifiedKg?: number;
  points: number;
  verifiedPoints?: number;
  status: EcoRewardStatus;
  collectionStatus: CollectionStatus;
  requestId?: string;
  createdAt: string;
  verifiedAt?: string;
}

export interface EcoCollectionRequest {
  id: string;
  uid: string;
  email?: string;
  type: 'eco_reward_pickup';
  rewardId: string;
  deviceId: string;
  deviceName?: string;
  status: CollectionStatus;
  timestamp: number;
  updatedAt?: number;
}

export const ECO_POINT_RATES: Record<WasteType, number> = {
  plastic: 100,
  aluminium: 180,
  paper: 70,
  other: 40,
};

export const ECO_POINT_VALUE_NAIRA = 0.1;

export const WASTE_TYPE_LABELS: Record<WasteType, string> = {
  plastic: 'Plastic',
  aluminium: 'Aluminium',
  paper: 'Paper / Cardboard',
  other: 'Other approved waste',
};
