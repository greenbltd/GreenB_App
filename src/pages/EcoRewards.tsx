import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { Coins, Leaf, PackageCheck, Recycle, Sparkles, Truck, WalletCards, ArrowRight, Clock3, CircleCheck, Route as RouteIcon } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { fetchDevices, subscribeEcoCollectionRequests, subscribeEcoRewards, subscribeEcoWallet, claimEcoReward, requestEcoCollection, calculateEcoRewardPoints } from '@/services/realtime';
import type { Device } from '@/types/device';
import type { EcoCollectionRequest, EcoRewardTransaction, EcoWallet, WasteType } from '@/types/rewards';
import { ECO_POINT_RATES, ECO_POINT_VALUE_NAIRA, WASTE_TYPE_LABELS } from '@/types/rewards';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const statusSteps: Array<{ key: EcoCollectionRequest['status']; label: string }> = [
  { key: 'pending', label: 'Requested' },
  { key: 'assigned', label: 'Agent assigned' },
  { key: 'en_route', label: 'On the way' },
  { key: 'collected', label: 'Collected' },
  { key: 'verified', label: 'Verified' },
];

const statusRank: Record<EcoCollectionRequest['status'], number> = {
  not_requested: 0,
  pending: 1,
  assigned: 2,
  en_route: 3,
  collected: 4,
  verified: 5,
};

const formatDate = (value: string | number) => new Date(value).toLocaleDateString(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const EcoRewards = () => {
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [uid, setUid] = useState('');
  const [email, setEmail] = useState('');
  const [wallet, setWallet] = useState<EcoWallet>({
    pointsBalance: 0,
    pendingPoints: 0,
    lifetimePoints: 0,
    totalKg: 0,
    totalCollections: 0,
    plasticKg: 0,
    aluminiumKg: 0,
    paperKg: 0,
    otherKg: 0,
  });
  const [rewards, setRewards] = useState<EcoRewardTransaction[]>([]);
  const [requests, setRequests] = useState<EcoCollectionRequest[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(searchParams.get('device') ?? '');
  const [wasteType, setWasteType] = useState<WasteType>('plastic');
  const [estimatedKg, setEstimatedKg] = useState('5');
  const [isClaiming, setIsClaiming] = useState(false);
  const [requestingRewardId, setRequestingRewardId] = useState('');

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? '');
      setEmail(user?.email ?? '');
    });
  }, []);

  useEffect(() => {
    if (!uid) return;
    const unsubWallet = subscribeEcoWallet(uid, setWallet);
    const unsubRewards = subscribeEcoRewards(uid, setRewards);
    const unsubRequests = subscribeEcoCollectionRequests(uid, setRequests);
    let active = true;
    fetchDevices(uid).then((items) => {
      if (!active) return;
      setDevices(items);
      setSelectedDeviceId((current) => current || items.find((device) => device.isFull)?.id || items[0]?.id || '');
    }).catch(() => {
      if (active) toast({ title: 'Unable to load bins', description: 'Please refresh and try again.', variant: 'destructive' });
    });
    return () => {
      active = false;
      unsubWallet();
      unsubRewards();
      unsubRequests();
    };
  }, [uid, toast]);

  const selectedDevice = devices.find((device) => device.id === selectedDeviceId);
  const parsedKg = Math.max(0, Number(estimatedKg) || 0);
  const estimatedPoints = calculateEcoRewardPoints(wasteType, parsedKg);
  const estimatedValue = estimatedPoints * ECO_POINT_VALUE_NAIRA;
  const verifiedRewards = rewards.filter((reward) => reward.status === 'verified');
  const activeRequest = requests.find((request) => request.status !== 'verified');
  const currentRequest = (rewardId: string) => requests.find((request) => request.rewardId === rewardId);

  const environmentalStats = useMemo(() => ({
    plastic: wallet.plasticKg,
    aluminium: wallet.aluminiumKg,
    paper: wallet.paperKg,
    other: wallet.otherKg,
    landfillKg: wallet.totalKg,
  }), [wallet]);

  const handleClaim = async () => {
    if (!uid || !selectedDeviceId) {
      toast({ title: 'Choose a smart bin', description: 'Select the full bin connected to this reward claim.', variant: 'destructive' });
      return;
    }
    if (!parsedKg) {
      toast({ title: 'Add an estimated weight', description: 'Enter the estimated recyclable weight in kilograms.', variant: 'destructive' });
      return;
    }
    setIsClaiming(true);
    try {
      await claimEcoReward({
        uid,
        deviceId: selectedDeviceId,
        deviceName: selectedDevice?.name,
        wasteType,
        estimatedKg: parsedKg,
      });
      toast({ title: 'EcoReward claimed', description: `${estimatedPoints.toLocaleString()} EcoPoints are pending collection verification.` });
      setEstimatedKg('5');
    } catch (error) {
      toast({ title: 'Claim failed', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setIsClaiming(false);
    }
  };

  const handlePickup = async (reward: EcoRewardTransaction) => {
    if (!uid || currentRequest(reward.id)) return;
    setRequestingRewardId(reward.id);
    try {
      await requestEcoCollection({ uid, email, reward });
      toast({ title: 'Pickup requested', description: 'A GreenB collection agent will be assigned to your request.' });
    } catch (error) {
      toast({ title: 'Request failed', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setRequestingRewardId('');
    }
  };

  return (
    <Layout>
      <div className="mx-auto max-w-7xl space-y-8 pb-12">
        <section className="relative overflow-hidden rounded-[2rem] border border-emerald-500/20 bg-gradient-to-br from-emerald-500/15 via-card to-card p-6 shadow-xl shadow-emerald-500/5 sm:p-8">
          <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl space-y-3">
              <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-300">
                <Sparkles className="mr-1.5 h-3.5 w-3.5" /> EcoReward cashback
              </Badge>
              <h1 className="font-display text-4xl font-black tracking-tight text-foreground sm:text-5xl">Turn recycling into rewards.</h1>
              <p className="text-base leading-7 text-muted-foreground">Claim EcoPoints when your smart bin is full, request a pickup, and grow your verified reward balance with every collection.</p>
            </div>
            <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
              <Leaf className="h-5 w-5" />
              <span>Every verified kilogram counts.</span>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-500/15 to-card">
            <CardHeader className="pb-2"><CardDescription>Available EcoPoints</CardDescription><CardTitle className="flex items-end gap-2 text-3xl"><Coins className="h-7 w-7 text-emerald-500" />{wallet.pointsBalance.toLocaleString()}</CardTitle></CardHeader>
            <CardContent><p className="text-xs text-muted-foreground">≈ ₦{(wallet.pointsBalance * ECO_POINT_VALUE_NAIRA).toLocaleString(undefined, { maximumFractionDigits: 2 })} estimated value</p></CardContent>
          </Card>
          <Card><CardHeader className="pb-2"><CardDescription>Pending verification</CardDescription><CardTitle className="text-3xl text-amber-600 dark:text-amber-400">{wallet.pendingPoints.toLocaleString()}</CardTitle></CardHeader><CardContent><p className="text-xs text-muted-foreground">Released after collection weight is verified</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Verified recycling</CardDescription><CardTitle className="flex items-end gap-2 text-3xl"><Recycle className="h-7 w-7 text-primary" />{wallet.totalKg.toFixed(1)} kg</CardTitle></CardHeader><CardContent><p className="text-xs text-muted-foreground">Across {wallet.totalCollections} completed collections</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Active pickup</CardDescription><CardTitle className="flex items-end gap-2 text-3xl"><Truck className="h-7 w-7 text-blue-500" />{activeRequest ? '1' : '0'}</CardTitle></CardHeader><CardContent><p className="text-xs text-muted-foreground">{activeRequest ? activeRequest.status.replace('_', ' ') : 'No pickup in progress'}</p></CardContent></Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <Card className="overflow-hidden border-emerald-500/20">
            <CardHeader className="border-b border-border/60 bg-emerald-500/5">
              <CardTitle className="flex items-center gap-2"><WalletCards className="h-5 w-5 text-emerald-500" /> Claim your EcoReward</CardTitle>
              <CardDescription>Start with the full smart bin notification. The first points are estimated and become available after verification.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 p-6">
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <div className="flex items-start gap-3"><PackageCheck className="mt-0.5 h-5 w-5 text-emerald-500" /><div><p className="font-semibold text-foreground">Your bin is ready for a reward</p><p className="mt-1 text-sm text-muted-foreground">Select the bin that has reached collection level, then tell us what was sorted inside it.</p></div></div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2"><Label htmlFor="reward-device">Smart bin</Label><Select value={selectedDeviceId} onValueChange={setSelectedDeviceId}><SelectTrigger id="reward-device"><SelectValue placeholder="Select a smart bin" /></SelectTrigger><SelectContent>{devices.map((device) => <SelectItem key={device.id} value={device.id}>{device.name || device.id} · {device.binPercentage}% full</SelectItem>)}</SelectContent></Select>{selectedDevice && <p className="text-xs text-muted-foreground">{selectedDevice.location || 'Location not set'} · {selectedDevice.isFull ? 'Full bin' : 'Current fill ' + selectedDevice.binPercentage + '%'}</p>}</div>
                <div className="space-y-2"><Label htmlFor="waste-type">Recyclable type</Label><Select value={wasteType} onValueChange={(value) => setWasteType(value as WasteType)}><SelectTrigger id="waste-type"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(WASTE_TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label} · {ECO_POINT_RATES[value as WasteType]} pts/kg</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label htmlFor="estimated-kg">Estimated weight (kg)</Label><Input id="estimated-kg" type="number" min="0.1" step="0.1" value={estimatedKg} onChange={(event) => setEstimatedKg(event.target.value)} /></div>
              </div>
              <div className="flex flex-col gap-4 rounded-2xl bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm text-muted-foreground">Estimated reward</p><p className="font-display text-3xl font-black text-emerald-600 dark:text-emerald-400">{estimatedPoints.toLocaleString()} <span className="text-sm font-semibold">EcoPoints</span></p></div><div className="text-left sm:text-right"><p className="text-sm text-muted-foreground">Estimated cashback value</p><p className="text-xl font-bold text-foreground">₦{estimatedValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p></div></div>
              <Button onClick={handleClaim} disabled={isClaiming || !devices.length} className="w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto"><Coins className="mr-2 h-4 w-4" />{isClaiming ? 'Claiming...' : 'Claim EcoReward'}</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Leaf className="h-5 w-5 text-emerald-500" /> Environmental impact</CardTitle><CardDescription>Your verified contribution to a cleaner community.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-emerald-500/10 p-4"><p className="text-xs text-muted-foreground">Landfill diversion</p><p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{environmentalStats.landfillKg.toFixed(1)} kg</p></div><div className="rounded-xl bg-primary/10 p-4"><p className="text-xs text-muted-foreground">Verified pickups</p><p className="mt-1 text-2xl font-bold text-primary">{wallet.totalCollections}</p></div></div>
              <div className="space-y-3">{([['plastic', 'Plastic', environmentalStats.plastic], ['aluminium', 'Aluminium', environmentalStats.aluminium], ['paper', 'Paper / cardboard', environmentalStats.paper], ['other', 'Other approved waste', environmentalStats.other]] as const).map(([key, label, value]) => <div key={key}><div className="mb-1 flex justify-between text-xs"><span className="text-muted-foreground">{label}</span><span className="font-medium text-foreground">{value.toFixed(1)} kg</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full', key === 'plastic' ? 'bg-emerald-500' : key === 'aluminium' ? 'bg-sky-500' : key === 'paper' ? 'bg-amber-500' : 'bg-slate-500')} style={{ width: `${environmentalStats.landfillKg ? Math.min(100, (value / environmentalStats.landfillKg) * 100) : 0}%` }} /></div></div>)}</div>
              <p className="border-t border-border pt-3 text-xs text-muted-foreground">Impact values are based on verified collection records. More impact metrics will be added as GreenB expands its recycling network.</p>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-primary" /> Reward history</CardTitle><CardDescription>Track claims, pickup requests, and verified EcoPoints.</CardDescription></CardHeader><CardContent>{rewards.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center"><Recycle className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 font-medium">No EcoRewards yet</p><p className="mt-1 text-sm text-muted-foreground">Your first full-bin claim will appear here.</p></div> : <div className="space-y-3">{rewards.map((reward) => { const request = currentRequest(reward.id); const shownPoints = reward.verifiedPoints ?? reward.points; return <div key={reward.id} className="rounded-2xl border border-border/70 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{reward.deviceName || reward.deviceId}</p><Badge variant={reward.status === 'verified' ? 'default' : 'secondary'}>{reward.status.replace('_', ' ')}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{WASTE_TYPE_LABELS[reward.wasteType]} · {reward.verifiedKg ?? reward.estimatedKg} kg · {formatDate(reward.createdAt)}</p></div><div className="text-left sm:text-right"><p className="font-display text-xl font-bold text-emerald-600 dark:text-emerald-400">{shownPoints.toLocaleString()} pts</p><p className="text-xs text-muted-foreground">≈ ₦{(shownPoints * ECO_POINT_VALUE_NAIRA).toLocaleString()}</p></div></div><div className="mt-4 flex flex-wrap items-center gap-2">{request ? <Badge variant="outline" className="border-blue-500/30 text-blue-600 dark:text-blue-300"><RouteIcon className="mr-1 h-3 w-3" /> {request.status.replace('_', ' ')}</Badge> : <Button size="sm" variant="outline" onClick={() => handlePickup(reward)} disabled={requestingRewardId === reward.id || reward.status === 'verified'}><Truck className="mr-1.5 h-3.5 w-3.5" />{requestingRewardId === reward.id ? 'Requesting...' : 'Request pickup'}</Button>}{reward.status === 'verified' && <span className="flex items-center text-xs text-emerald-600 dark:text-emerald-400"><CircleCheck className="mr-1 h-3.5 w-3.5" /> Reward released</span>}</div></div>})}</div>}</CardContent></Card>
          <Card className="border-primary/20 bg-gradient-to-br from-primary/10 to-card"><CardHeader><CardTitle>How EcoReward works</CardTitle><CardDescription>A transparent path from full bin to cashback-ready points.</CardDescription></CardHeader><CardContent className="space-y-5">{statusSteps.slice(0, 4).map((step, index) => <div key={step.key} className="flex items-start gap-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">{index + 1}</div><div><p className="font-medium">{step.label}</p><p className="text-sm text-muted-foreground">{index === 0 ? 'Claim an estimated reward when your bin is full.' : index === 1 ? 'A GreenB agent receives your pickup request.' : index === 2 ? 'Follow the collection journey in your wallet.' : 'Weight is confirmed before points are released.'}</p></div></div>)}<div className="rounded-xl border border-dashed border-primary/30 p-4"><p className="text-sm font-semibold">Future redemption options</p><p className="mt-1 text-xs text-muted-foreground">Cash withdrawal, airtime/data, GreenB services, and partner discounts will be enabled after wallet verification and payout integration.</p><Link to="/settings" className="mt-3 inline-flex items-center text-sm font-semibold text-primary hover:underline">Manage notifications <ArrowRight className="ml-1 h-4 w-4" /></Link></div></CardContent></Card>
        </section>
      </div>
    </Layout>
  );
};

export default EcoRewards;
