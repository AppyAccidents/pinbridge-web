'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { clearAllData, getPlaceCount } from '@/lib/db';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Trash2, Download, AlertTriangle, Shield, Crown, Eye } from 'lucide-react';
import { adService } from '@/lib/services/ad-service';
import { paymentService } from '@/lib/services/payment-service';
import { authService } from '@/lib/services/auth-service';
import { useApiAvailability } from '@/lib/hooks/use-api-availability';

export default function SettingsPage() {
  const router = useRouter();
  const [placeCount, setPlaceCount] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [adPreferences, setAdPreferences] = useState({ adsEnabled: true });
  const [isPremium, setIsPremium] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const { status: apiStatus, isLoading: apiStatusLoading } = useApiAvailability();
  const [automationAdminStatus, setAutomationAdminStatus] = useState<{
    redis: { ok: boolean; error: string | null; configured: boolean };
    guardrails: {
      free: {
        maxPlacesPerSession: number;
        maxConcurrency: number;
        maxBatchSize: number;
        maxRetryAttempts: number;
        pauseOnError: boolean;
        dailyCap: number;
        perMinuteCap: number;
      };
      premium: {
        maxPlacesPerSession: number;
        maxConcurrency: number;
        maxBatchSize: number;
        maxRetryAttempts: number;
        pauseOnError: boolean;
        dailyCap: number;
        perMinuteCap: number;
      };
    };
  } | null>(null);
  const [metricsUserId, setMetricsUserId] = useState('');
  const [metricsTier, setMetricsTier] = useState<'free' | 'premium'>('free');
  const [metricsResult, setMetricsResult] = useState<{
    userId: string;
    tier: string;
    counts: { daily: number; minute: number };
    caps: { daily: number; minute: number };
    rolling7Days?: Array<{ date: string; count: number }>;
  } | null>(null);
  const [aggregateMetrics, setAggregateMetrics] = useState<{
    totalDaily: number;
    totalsByTier?: { free: number; premium: number };
    rolling7Days?: { free: number; premium: number; total: number };
    rolling7DaysSeries?: Array<{ date: string; free: number; premium: number; total: number }>;
    topUsers: Array<{ userId: string; count: number; tier?: string }>;
  } | null>(null);
  const [sessionIdInput, setSessionIdInput] = useState('session_test_123');
  const [sessionRoleInput, setSessionRoleInput] = useState<'admin' | 'user'>('admin');
  const [sessionPremiumInput, setSessionPremiumInput] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [pendingClear, setPendingClear] = useState<{ userId: string; tier: 'free' | 'premium' } | null>(null);

  useEffect(() => {
    getPlaceCount().then(setPlaceCount);
    
    // Load ad preferences
    const stored = localStorage.getItem('pinbridge_ad_preferences');
    if (stored) {
      setAdPreferences(JSON.parse(stored));
    }

    // Check premium status
    setIsPremium(paymentService.isPremiumUser());
    setIsLoggedIn(authService.isLoggedIn());
    setIsAdmin(authService.isAdmin());

    // Listen for subscription updates
    const handleSubscriptionUpdate = () => {
      setIsPremium(paymentService.isPremiumUser());
    };

    window.addEventListener('subscription-updated', handleSubscriptionUpdate);
    return () => window.removeEventListener('subscription-updated', handleSubscriptionUpdate);
  }, []);

  const loadAdminStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/automation-status', { cache: 'no-store' });
      if (!response.ok) {
        return;
      }
      const data = await response.json();
      setAutomationAdminStatus(data);
    } catch {
      // ignore
    }
  }, []);

  const loadAggregates = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/automation-metrics', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      if (data?.aggregates) {
        setAggregateMetrics(data.aggregates);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    loadAdminStatus();
    loadAggregates();

    const interval = setInterval(() => {
      loadAdminStatus();
      loadAggregates();
    }, 60000);

    return () => clearInterval(interval);
  }, [isAdmin, loadAdminStatus, loadAggregates]);

  const handleLoadMetrics = async () => {
    if (!metricsUserId.trim()) return;

    try {
      const response = await fetch(
        `/api/admin/automation-metrics?userId=${encodeURIComponent(metricsUserId.trim())}&tier=${metricsTier}`,
        { cache: 'no-store' }
      );
      if (!response.ok) return;
      const data = await response.json();
      setMetricsResult(data);
    } catch {
      // ignore
    }
  };

  const handleExportCsv = () => {
    if (!metricsResult?.rolling7Days || metricsResult.rolling7Days.length === 0) return;
    const rows = [
      ['date', 'count'],
      ...metricsResult.rolling7Days.map((entry) => [entry.date, String(entry.count)]),
    ];
    const csv = rows.map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `automation-history-${metricsResult.userId}-${metricsResult.tier}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderSparkline = (values: number[], stroke: string) => {
    if (values.length === 0) return null;
    const max = Math.max(...values, 1);
    const width = 160;
    const height = 40;
    const step = values.length > 1 ? width / (values.length - 1) : width;
    const points = values
      .map((value, index) => {
        const x = index * step;
        const y = height - (value / max) * height;
        return `${x},${y}`;
      })
      .join(' ');

    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <polyline
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          points={points}
        />
      </svg>
    );
  };

  const handleConfirmClear = async () => {
    if (!pendingClear) return;
    await fetch(
      `/api/admin/automation-metrics?userId=${encodeURIComponent(pendingClear.userId)}&tier=${pendingClear.tier}&clear=true`,
      { cache: 'no-store' }
    );
    setMetricsResult(null);
    setShowClearConfirm(false);
    setPendingClear(null);
  };

  const handleDeleteAll = async () => {
    await clearAllData();
    setShowDeleteConfirm(false);
    router.push('/');
  };

  const handleAdPreferenceChange = (enabled: boolean) => {
    const newPreferences = { adsEnabled: enabled };
    setAdPreferences(newPreferences);
    adService.updateUserPreferences(newPreferences);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your data and preferences</p>
      </div>

      {/* Premium Status */}
      {isPremium ? (
        <Card className="border-yellow-200 bg-gradient-to-r from-yellow-50 to-orange-50">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Crown className="h-5 w-5 text-yellow-600" />
              <span className="text-yellow-900">Premium Account</span>
              <Badge className="bg-yellow-600">Active</Badge>
            </CardTitle>
            <CardDescription className="text-yellow-800">
              You're enjoying an ad-free experience with unlimited transfers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => router.push('/premium')}>
              Manage Subscription
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Crown className="h-5 w-5 text-blue-600" />
              <span className="text-blue-900">Upgrade to Premium</span>
            </CardTitle>
            <CardDescription className="text-blue-800">
              Remove ads, get unlimited transfers, and priority support
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => router.push('/premium')}>
              <Crown className="h-4 w-4 mr-2" />
              Upgrade Now
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Ad Preferences */}
      {!isPremium && !isLoggedIn && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Eye className="h-5 w-5" />
              <span>Advertisement Preferences</span>
            </CardTitle>
            <CardDescription>
              Control how ads are displayed in PinBridge
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="ads-enabled">Show Advertisements</Label>
                <p className="text-sm text-muted-foreground">
                  Ads help keep PinBridge free. Disable to hide ads (some features may be limited).
                </p>
              </div>
              <Switch
                id="ads-enabled"
                checked={adPreferences.adsEnabled}
                onCheckedChange={handleAdPreferenceChange}
              />
            </div>

            {!adPreferences.adsEnabled && (
              <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <div className="flex items-start space-x-2">
                  <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-orange-900">Limited Experience</p>
                    <p className="text-orange-800">
                      With ads disabled, some features may be limited. Consider upgrading to Premium for the best experience.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="pt-2">
              <h4 className="font-medium mb-2">Why We Show Ads</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Ads help us keep PinBridge completely free</li>
                <li>• We only show relevant, travel-related advertisements</li>
                <li>• Your privacy is protected - we don't sell personal data</li>
                <li>• Premium users enjoy an ad-free experience</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoggedIn && !isPremium && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Eye className="h-5 w-5 text-green-600" />
              <span className="text-green-900">Ads Disabled for Logged-In Users</span>
            </CardTitle>
            <CardDescription className="text-green-800">
              You're logged in, so we keep the experience ad-free.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Automation Status</CardTitle>
            <CardDescription>Automated transfer availability for your account</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            {automationAdminStatus && (
              <div className="space-y-2 rounded-md border border-muted bg-muted/50 p-3 text-xs text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Redis:</span>
                  <span>
                    {automationAdminStatus.redis.configured
                      ? automationAdminStatus.redis.ok
                        ? 'Healthy'
                        : 'Degraded'
                      : 'Not configured'}
                  </span>
                </div>
                {automationAdminStatus.redis.error && (
                  <div className="text-amber-700">
                    Redis error: {automationAdminStatus.redis.error}
                  </div>
                )}
                <div className="space-y-1">
                  <div className="font-medium text-foreground">Free Guardrails</div>
                  <div>
                    {automationAdminStatus.guardrails.free.dailyCap} per day ·{' '}
                    {automationAdminStatus.guardrails.free.perMinuteCap} per minute ·{' '}
                    {automationAdminStatus.guardrails.free.maxPlacesPerSession} places/session
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="font-medium text-foreground">Premium Guardrails</div>
                  <div>
                    {automationAdminStatus.guardrails.premium.dailyCap} per day ·{' '}
                    {automationAdminStatus.guardrails.premium.perMinuteCap} per minute ·{' '}
                    {automationAdminStatus.guardrails.premium.maxPlacesPerSession} places/session
                  </div>
                </div>
              </div>
            )}
            {apiStatusLoading && <p>Checking API availability...</p>}
            {!apiStatusLoading && apiStatus && (
              <div className="space-y-1">
                <p>
                  Apple Maps API: {apiStatus.apple.configured ? 'Configured' : 'Not configured'}
                </p>
                <p>
                  Google Maps API: {apiStatus.google.configured ? 'Configured' : 'Not configured'}
                </p>
                {!apiStatus.apple.configured && !apiStatus.google.configured && (
                  <p className="text-amber-700">
                    Automated transfer is temporarily unavailable. Please configure API keys.
                  </p>
                )}
              </div>
            )}

            <div className="mt-4 border-t pt-3 text-xs text-muted-foreground">
              <div className="font-medium text-foreground">Usage Metrics</div>
              {aggregateMetrics && (
                <div className="mt-2 rounded-md border bg-muted/30 p-2 text-xs">
                  <div>Total automated sessions today: {aggregateMetrics.totalDaily}</div>
                  {aggregateMetrics.totalsByTier && (
                    <div className="mt-1">
                      Free: {aggregateMetrics.totalsByTier.free} · Premium: {aggregateMetrics.totalsByTier.premium}
                    </div>
                  )}
                  {aggregateMetrics.rolling7Days && (
                    <div className="mt-1">
                      Last 7 days: {aggregateMetrics.rolling7Days.total} (Free: {aggregateMetrics.rolling7Days.free} · Premium: {aggregateMetrics.rolling7Days.premium})
                    </div>
                  )}
                  {aggregateMetrics.rolling7DaysSeries && aggregateMetrics.rolling7DaysSeries.length > 0 && (
                    <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2">
                      <div className="rounded border bg-background p-2">
                        <div className="text-[10px] uppercase text-muted-foreground">Total</div>
                        {renderSparkline(
                          aggregateMetrics.rolling7DaysSeries.map((d) => d.total),
                          '#2563eb'
                        )}
                      </div>
                      <div className="rounded border bg-background p-2">
                        <div className="text-[10px] uppercase text-muted-foreground">Free</div>
                        {renderSparkline(
                          aggregateMetrics.rolling7DaysSeries.map((d) => d.free),
                          '#16a34a'
                        )}
                      </div>
                      <div className="rounded border bg-background p-2">
                        <div className="text-[10px] uppercase text-muted-foreground">Premium</div>
                        {renderSparkline(
                          aggregateMetrics.rolling7DaysSeries.map((d) => d.premium),
                          '#f59e0b'
                        )}
                      </div>
                    </div>
                  )}
                  {aggregateMetrics.topUsers.length > 0 && (
                    <div className="mt-1">
                      Top users: {aggregateMetrics.topUsers
                        .map((u) => `${u.userId} (${u.count}${u.tier ? `, ${u.tier}` : ''})`)
                        .join(', ')}
                    </div>
                  )}
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  type="text"
                  placeholder="User ID"
                  value={metricsUserId}
                  onChange={(e) => setMetricsUserId(e.target.value)}
                  className="flex-1 min-w-[160px] rounded-md border px-2 py-1 text-xs"
                />
                <select
                  value={metricsTier}
                  onChange={(e) => setMetricsTier(e.target.value as 'free' | 'premium')}
                  className="rounded-md border px-2 py-1 text-xs"
                >
                  <option value="free">Free</option>
                  <option value="premium">Premium</option>
                </select>
                <Button size="sm" variant="outline" onClick={handleLoadMetrics}>
                  Load
                </Button>
                <Button size="sm" variant="outline" onClick={handleExportCsv}>
                  Export CSV
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    if (!metricsUserId.trim()) return;
                    setPendingClear({ userId: metricsUserId.trim(), tier: metricsTier });
                    setShowClearConfirm(true);
                  }}
                >
                  Clear
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const payload = {
                      sessionId: sessionIdInput || 'session_test_123',
                      userId: metricsUserId || 'user_test_123',
                      role: sessionRoleInput,
                      premium: sessionPremiumInput,
                      ttlSeconds: 60 * 60 * 24 * 7,
                    };
                    const origin = window.location.origin;
                    const curl = [
                      'curl -X POST',
                      `\"${origin}/api/admin/session\"`,
                      '-H \"Content-Type: application/json\"',
                      '-H \"x-admin-token: $ADMIN_SETUP_TOKEN\"',
                      `-d '${JSON.stringify(payload)}'`,
                    ].join(' ');
                    navigator.clipboard.writeText(curl).catch(() => {});
                  }}
                >
                  Copy curl
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <input
                  type="text"
                  placeholder="Session ID"
                  value={sessionIdInput}
                  onChange={(e) => setSessionIdInput(e.target.value)}
                  className="flex-1 min-w-[160px] rounded-md border px-2 py-1 text-xs"
                />
                <select
                  value={sessionRoleInput}
                  onChange={(e) => setSessionRoleInput(e.target.value as 'admin' | 'user')}
                  className="rounded-md border px-2 py-1 text-xs"
                >
                  <option value="admin">Admin</option>
                  <option value="user">User</option>
                </select>
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={sessionPremiumInput}
                    onChange={(e) => setSessionPremiumInput(e.target.checked)}
                  />
                  Premium
                </label>
              </div>
              {metricsResult && (
                <div className="mt-2 rounded-md border bg-muted/30 p-2 text-xs">
                  <div>
                    {metricsResult.userId} · {metricsResult.tier}
                  </div>
                  <div>
                    Daily: {metricsResult.counts.daily}/{metricsResult.caps.daily}
                  </div>
                  <div>
                    Per minute: {metricsResult.counts.minute}/{metricsResult.caps.minute}
                  </div>
                  {metricsResult.rolling7Days && metricsResult.rolling7Days.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <div className="font-medium text-foreground">Last 7 days</div>
                      <div className="grid grid-cols-2 gap-1">
                        {metricsResult.rolling7Days.map((entry) => (
                          <div key={entry.date} className="flex justify-between">
                            <span>{entry.date}</span>
                            <span>{entry.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear Automation Counters</DialogTitle>
            <DialogDescription>
              This will remove all rate-limit counters for the selected user and tier. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClearConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmClear}>
              Clear Counters
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Privacy & Data */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Shield className="h-5 w-5" />
            <span>Privacy & Data</span>
          </CardTitle>
          <CardDescription>
            Your data privacy and security settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-medium">Data Storage</h4>
            <p className="text-sm text-muted-foreground">
              All your data is stored locally in your browser by default. {placeCount} places stored.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium">Analytics</h4>
            <p className="text-sm text-muted-foreground">
              We collect anonymous usage data to improve PinBridge. No personal information is shared.
            </p>
          </div>

          <Button variant="outline" onClick={() => router.push('/export')}>
            <Download className="w-4 h-4 mr-2" />
            Export Data Backup
          </Button>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-red-600 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Danger Zone
          </CardTitle>
          <CardDescription>These actions cannot be undone</CardDescription>
        </CardHeader>
        <CardContent>
          {!showDeleteConfirm ? (
            <Button variant="destructive" onClick={() => setShowDeleteConfirm(true)}>
              <Trash2 className="w-4 h-4 mr-2" />
              Delete All Local Data
            </Button>
          ) : (
            <div className="space-y-4 p-4 border border-red-200 rounded-lg bg-red-50">
              <p className="text-sm text-red-800">
                This will permanently delete all {placeCount} places, collections, and transfer
                packs from your browser. This cannot be undone.
              </p>
              <div className="flex gap-2">
                <Button variant="destructive" onClick={handleDeleteAll}>
                  Yes, Delete Everything
                </Button>
                <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle>About PinBridge</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>PinBridge helps you transfer saved places between Apple Maps and Google Maps.</p>
          <p>
            This is a guided migration tool - you&apos;ll need to manually save each place in the
            target app because neither Apple nor Google provide public APIs to add places to your
            saved lists.
          </p>
          <p className="pt-2">
            <strong>Privacy:</strong> Your data stays on your device by default. No account
            required.
          </p>
          <p className="pt-2">
            <strong>Support:</strong> PinBridge is supported by ads and premium subscriptions.
            Thank you for helping us keep this service free!
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
