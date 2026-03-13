'use client';

import React, { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  Upload,
  Sun,
  Moon,
  MapPin,
  ExternalLink,
  Copy,
  Trash2,
  Download,
  FileDown,
  Link2,
  ChevronDown,
  ChevronUp,
  ArrowLeftRight,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { parseFile } from '@/lib/parsers';
import { exportToKml } from '@/lib/exporters/kml';
import { exportToShortcut } from '@/lib/exporters/shortcut';
import { exportQuickCsv } from '@/lib/exporters/csv';
import { generateBulkLinks } from '@/lib/exporters/links';
import {
  generateAppleMapsUrlForPlace,
  generateGoogleMapsUrlForPlace,
} from '@/lib/exporters/url';
import { downloadBlob } from '@/lib/exporters/download';
import type { ParsedPlace } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConvertPlace extends ParsedPlace {
  id: string;
  source?: string;
}

type Provider = 'apple' | 'google' | 'unknown';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectProvider(places: ParsedPlace[]): Provider {
  const urls = places
    .map((p) => p.sourceUrl ?? '')
    .filter(Boolean)
    .slice(0, 20);

  const apple = urls.filter((u) => u.includes('apple.com') || u.includes('maps.apple')).length;
  const google = urls.filter(
    (u) => u.includes('google.com/maps') || u.includes('goo.gl/maps'),
  ).length;

  if (apple > google) return 'apple';
  if (google > apple) return 'google';

  const listNames = places.map((p) => p.listName ?? '').join(' ').toLowerCase();
  if (listNames.includes('google') || listNames.includes('saved places')) return 'google';

  return 'unknown';
}

function deriveTarget(source: Provider): 'apple' | 'google' {
  return source === 'apple' ? 'google' : 'apple';
}

function generateTargetUrl(place: ConvertPlace, target: 'apple' | 'google'): string {
  return target === 'apple'
    ? generateAppleMapsUrlForPlace(place)
    : generateGoogleMapsUrlForPlace(place);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      style={{
        border: '1px solid hsl(var(--border))',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1rem',
          background: 'hsl(var(--accent))',
          color: 'hsl(var(--accent-foreground))',
          fontSize: '0.875rem',
          fontWeight: 500,
          cursor: 'pointer',
          border: 'none',
        }}
      >
        {title}
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        <div
          style={{
            padding: '1rem',
            background: 'hsl(var(--card))',
            color: 'hsl(var(--card-foreground))',
            fontSize: '0.8125rem',
            lineHeight: 1.6,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function PlaceCard({
  place,
  target,
  onDelete,
}: {
  place: ConvertPlace;
  target: 'apple' | 'google';
  onDelete: (id: string) => void;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const url = generateTargetUrl(place, target);
  const hasCoords = place.latitude != null && place.longitude != null;

  async function handleCopy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast({ title: 'Link copied!' });
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      style={{
        background: 'hsl(var(--card))',
        border: '1px solid hsl(var(--border))',
        borderRadius: 'var(--radius)',
        padding: '0.875rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.375rem',
      }}
    >
      {/* Name + list badge */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
        <span
          style={{
            fontWeight: 600,
            fontSize: '0.9375rem',
            color: 'hsl(var(--foreground))',
            flex: 1,
            lineHeight: 1.4,
          }}
        >
          {place.title || 'Unnamed Place'}
        </span>
        {place.listName && (
          <span
            style={{
              fontSize: '0.6875rem',
              padding: '0.125rem 0.5rem',
              borderRadius: '9999px',
              background: 'hsl(var(--primary) / 0.15)',
              color: 'hsl(var(--primary))',
              whiteSpace: 'nowrap',
              fontWeight: 500,
            }}
          >
            {place.listName}
          </span>
        )}
      </div>

      {/* Coords */}
      {hasCoords && (
        <span
          style={{
            fontSize: '0.75rem',
            color: 'hsl(var(--muted-foreground))',
            fontFamily: 'monospace',
          }}
        >
          {place.latitude!.toFixed(5)}, {place.longitude!.toFixed(5)}
        </span>
      )}

      {/* Address */}
      {place.address && (
        <span style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))' }}>
          {place.address}
        </span>
      )}

      {/* Notes */}
      {place.notes && (
        <span
          style={{
            fontSize: '0.75rem',
            color: 'hsl(var(--muted-foreground))',
            fontStyle: 'italic',
          }}
        >
          {place.notes}
        </span>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              fontSize: '0.75rem',
              color: 'hsl(var(--primary))',
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            <ExternalLink size={13} />
            Open in {target === 'apple' ? 'Apple Maps' : 'Google Maps'}
          </a>
        )}
        <button
          onClick={handleCopy}
          disabled={!url}
          title="Copy link"
          style={{
            marginLeft: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            fontSize: '0.75rem',
            color: copied ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
            background: 'none',
            border: 'none',
            cursor: url ? 'pointer' : 'default',
            padding: '0.25rem 0.375rem',
          }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          onClick={() => onDelete(place.id)}
          title="Remove place"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            color: 'hsl(var(--destructive))',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '0.25rem 0.375rem',
          }}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ConvertPage() {
  const { toast } = useToast();
  const [light, setLight] = useState(false);
  const [places, setPlaces] = useState<ConvertPlace[]>([]);
  const [sourceProvider, setSourceProvider] = useState<Provider>('unknown');
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const target = deriveTarget(sourceProvider);
  const withCoords = places.filter((p) => p.latitude != null && p.longitude != null).length;

  // -------------------------------------------------------------------------
  // File handling
  // -------------------------------------------------------------------------

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      if (!fileArray.length) return;
      setIsProcessing(true);
      try {
        let allPlaces: ConvertPlace[] = [];
        let totalErrors = 0;
        for (const file of fileArray) {
          const { places: parsed, errors } = await parseFile(file);
          totalErrors += errors.length;
          const converted: ConvertPlace[] = parsed.map((p) => ({
            ...p,
            id: crypto.randomUUID(),
            source: file.name,
          }));
          allPlaces = [...allPlaces, ...converted];
        }
        const detected = detectProvider(allPlaces);
        setSourceProvider(detected);
        setPlaces((prev) => [...prev, ...allPlaces]);
        toast({
          title: `Loaded ${allPlaces.length} place${allPlaces.length !== 1 ? 's' : ''}`,
          description:
            totalErrors > 0
              ? `${totalErrors} row${totalErrors !== 1 ? 's' : ''} had errors`
              : undefined,
        });
      } catch (err) {
        toast({
          title: 'Failed to parse file',
          description: err instanceof Error ? err.message : 'Unknown error',
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [toast],
  );

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) {
      processFiles(e.target.files);
      e.target.value = '';
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) {
      processFiles(e.dataTransfer.files);
    }
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  function handleDelete(id: string) {
    setPlaces((prev) => prev.filter((p) => p.id !== id));
  }

  function handleClearAll() {
    setPlaces([]);
    setSourceProvider('unknown');
  }

  // -------------------------------------------------------------------------
  // Exports
  // -------------------------------------------------------------------------

  function handleExportCsv() {
    const blob = exportQuickCsv(places, target);
    downloadBlob(blob, `pinbridge-${target}-${Date.now()}.csv`);
    toast({ title: 'CSV downloaded' });
  }

  function handleExportKml() {
    const blob = exportToKml(places, 'PinBridge Export');
    downloadBlob(blob, `pinbridge-${Date.now()}.kml`);
    toast({ title: 'KML downloaded' });
  }

  function handleExportShortcut() {
    const blob = exportToShortcut(places);
    downloadBlob(blob, `pinbridge-${Date.now()}.shortcut`);
    toast({ title: 'Shortcut downloaded' });
  }

  async function handleCopyLinks() {
    const text = generateBulkLinks(places, target);
    await navigator.clipboard.writeText(text);
    toast({ title: `${places.length} links copied to clipboard` });
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const wrapperStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: 'hsl(var(--background))',
    color: 'hsl(var(--foreground))',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  };

  return (
    <div className={`convert-theme${light ? ' light' : ''}`} style={wrapperStyle}>
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                             */}
      {/* ------------------------------------------------------------------ */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          background: 'hsl(var(--background) / 0.85)',
          borderBottom: '1px solid hsl(var(--border))',
        }}
      >
        <div
          style={{
            maxWidth: '72rem',
            margin: '0 auto',
            padding: '0 1rem',
            height: '3.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          {/* Logo */}
          <div
            style={{
              width: '2rem',
              height: '2rem',
              borderRadius: '0.5rem',
              background: 'hsl(var(--primary))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <MapPin size={16} color="white" />
          </div>

          <span style={{ fontWeight: 700, fontSize: '1rem', color: 'hsl(var(--foreground))' }}>
            PinBridge
          </span>

          <span
            style={{
              fontSize: '0.6875rem',
              fontWeight: 600,
              padding: '0.125rem 0.5rem',
              borderRadius: '9999px',
              background: 'hsl(var(--primary) / 0.15)',
              color: 'hsl(var(--primary))',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            APPYACCIDENTS 2026
          </span>

          <div style={{ flex: 1 }} />

          {/* Theme toggle */}
          <button
            onClick={() => setLight((v) => !v)}
            aria-label="Toggle theme"
            style={{
              width: '2.25rem',
              height: '2.25rem',
              borderRadius: '0.5rem',
              border: '1px solid hsl(var(--border))',
              background: 'hsl(var(--accent))',
              color: 'hsl(var(--accent-foreground))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            {light ? <Moon size={16} /> : <Sun size={16} />}
          </button>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Body                                                               */}
      {/* ------------------------------------------------------------------ */}
      <main style={{ maxWidth: '72rem', margin: '0 auto', padding: '2rem 1rem 4rem' }}>
        {places.length === 0 ? (
          /* ================================================================ */
          /* EMPTY STATE                                                       */
          /* ================================================================ */
          <div
            className="convert-animate-in"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem' }}
          >
            {/* Hero */}
            <div
              className="convert-stagger-1"
              style={{ textAlign: 'center', maxWidth: '36rem' }}
            >
              <h1
                style={{
                  fontSize: 'clamp(1.75rem, 5vw, 2.75rem)',
                  fontWeight: 800,
                  lineHeight: 1.15,
                  color: 'hsl(var(--foreground))',
                  marginBottom: '0.75rem',
                }}
              >
                Move your saved places
              </h1>
              <p
                style={{
                  fontSize: '1.0625rem',
                  color: 'hsl(var(--muted-foreground))',
                  lineHeight: 1.6,
                }}
              >
                Drop a Google Maps or Apple Maps export file and instantly convert it — no
                account, no upload, all local.
              </p>
            </div>

            {/* Decorative provider icons */}
            <div
              className="convert-animate-fade convert-stagger-2"
              style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}
            >
              {/* Google icon placeholder */}
              <div
                style={{
                  width: '3rem',
                  height: '3rem',
                  borderRadius: '0.75rem',
                  background: 'hsl(var(--accent))',
                  border: '1px solid hsl(var(--border))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.5rem',
                }}
              >
                🗺️
              </div>
              <ArrowLeftRight size={20} color="hsl(var(--primary))" />
              {/* Apple icon placeholder */}
              <div
                style={{
                  width: '3rem',
                  height: '3rem',
                  borderRadius: '0.75rem',
                  background: 'hsl(var(--accent))',
                  border: '1px solid hsl(var(--border))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.5rem',
                }}
              >
                🍎
              </div>
            </div>

            {/* Drop zone */}
            <div
              className="convert-stagger-3"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: '100%',
                maxWidth: '36rem',
                border: `2px dashed ${isDragging ? 'hsl(var(--primary))' : 'hsl(var(--border))'}`,
                borderRadius: 'calc(var(--radius) * 2)',
                padding: '3rem 2rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.75rem',
                cursor: 'pointer',
                background: isDragging ? 'hsl(var(--accent))' : 'hsl(var(--card))',
                transition: 'all 0.2s ease',
              }}
            >
              <Upload
                size={36}
                color={isDragging ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
              />
              <p
                style={{
                  fontWeight: 600,
                  fontSize: '1rem',
                  color: 'hsl(var(--foreground))',
                  margin: 0,
                }}
              >
                {isProcessing ? 'Processing…' : 'Drop your export file here'}
              </p>
              <p
                style={{
                  fontSize: '0.8125rem',
                  color: 'hsl(var(--muted-foreground))',
                  margin: 0,
                }}
              >
                or click to browse — CSV, JSON, GeoJSON, KML, KMZ, TSV, TXT
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.json,.geojson,.kml,.kmz,.tsv,.txt"
                multiple
                onChange={handleFileInputChange}
                style={{ display: 'none' }}
              />
            </div>

            {/* How-to instructions */}
            <div className="convert-stagger-4" style={{ width: '100%', maxWidth: '36rem' }}>
              <CollapsibleSection title="How to get your Google Maps data">
                <ol style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <li>
                    Open{' '}
                    <a
                      href="https://myaccount.google.com/data-and-privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'hsl(var(--primary))' }}
                    >
                      Google Takeout
                    </a>{' '}
                    and select only <strong>Maps (your places)</strong>.
                  </li>
                  <li>Choose <strong>Export once</strong>, JSON format, then download.</li>
                  <li>Unzip and find the <code>.json</code> or <code>.csv</code> files inside the <code>Maps</code> folder.</li>
                  <li>Drop those files above — or use the full{' '}
                    <Link href="/import" style={{ color: 'hsl(var(--primary))' }}>
                      Import flow
                    </Link>{' '}
                    for ZIP support.
                  </li>
                </ol>
              </CollapsibleSection>
            </div>

            {/* Cross-link to /import */}
            <p
              style={{
                fontSize: '0.875rem',
                color: 'hsl(var(--muted-foreground))',
                textAlign: 'center',
              }}
            >
              Need to import a full Takeout ZIP?{' '}
              <Link
                href="/import"
                style={{ color: 'hsl(var(--primary))', fontWeight: 500 }}
              >
                Use the full import flow →
              </Link>
            </p>

            {/* Footer */}
            <p
              style={{
                fontSize: '0.75rem',
                color: 'hsl(var(--muted-foreground))',
                marginTop: '2rem',
              }}
            >
              An AppyAccidents 2026 project
            </p>
          </div>
        ) : (
          /* ================================================================ */
          /* RESULTS STATE                                                     */
          /* ================================================================ */
          <div
            className="convert-animate-in"
            style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
          >
            {/* Summary bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.75rem',
                padding: '0.75rem 1rem',
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 'var(--radius)',
              }}
            >
              <MapPin size={16} color="hsl(var(--primary))" />
              <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>
                {places.length} place{places.length !== 1 ? 's' : ''}
              </span>
              <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.875rem' }}>
                {withCoords} with coordinates
              </span>
              {sourceProvider !== 'unknown' && (
                <span
                  style={{
                    fontSize: '0.8125rem',
                    padding: '0.125rem 0.5rem',
                    borderRadius: '9999px',
                    background: 'hsl(var(--accent))',
                    color: 'hsl(var(--accent-foreground))',
                  }}
                >
                  {sourceProvider === 'apple' ? 'Apple Maps → Google Maps' : 'Google Maps → Apple Maps'}
                </span>
              )}
              <div style={{ flex: 1 }} />
              {/* Add more files */}
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  fontSize: '0.8125rem',
                  color: 'hsl(var(--primary))',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                + Add more
              </button>
              <button
                onClick={handleClearAll}
                style={{
                  fontSize: '0.8125rem',
                  color: 'hsl(var(--destructive))',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                Clear all
              </button>
              {/* Hidden input for "add more" */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.json,.geojson,.kml,.kmz,.tsv,.txt"
                multiple
                onChange={handleFileInputChange}
                style={{ display: 'none' }}
              />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) 300px',
                gap: '1.25rem',
                alignItems: 'start',
              }}
            >
              {/* Place list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                {places.map((place) => (
                  <PlaceCard
                    key={place.id}
                    place={place}
                    target={target}
                    onDelete={handleDelete}
                  />
                ))}
              </div>

              {/* Export panel */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <Card
                  style={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 'var(--radius)',
                  }}
                >
                  <CardHeader style={{ paddingBottom: '0.5rem' }}>
                    <CardTitle
                      style={{ fontSize: '0.9375rem', color: 'hsl(var(--card-foreground))' }}
                    >
                      Export
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '0.5rem',
                      }}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportCsv}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.375rem',
                          borderColor: 'hsl(var(--border))',
                          color: 'hsl(var(--foreground))',
                          background: 'hsl(var(--accent))',
                        }}
                      >
                        <Download size={14} />
                        CSV
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportKml}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.375rem',
                          borderColor: 'hsl(var(--border))',
                          color: 'hsl(var(--foreground))',
                          background: 'hsl(var(--accent))',
                        }}
                      >
                        <FileDown size={14} />
                        KML
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportShortcut}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.375rem',
                          borderColor: 'hsl(var(--border))',
                          color: 'hsl(var(--foreground))',
                          background: 'hsl(var(--accent))',
                        }}
                      >
                        <ArrowLeftRight size={14} />
                        Shortcut
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopyLinks}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.375rem',
                          borderColor: 'hsl(var(--border))',
                          color: 'hsl(var(--foreground))',
                          background: 'hsl(var(--accent))',
                        }}
                      >
                        <Link2 size={14} />
                        Copy Links
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Export help */}
                <CollapsibleSection title="Export help">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                    <div>
                      <strong style={{ color: 'hsl(var(--foreground))' }}>
                        Apple Maps Guide (.shortcut)
                      </strong>
                      <p style={{ marginTop: '0.25rem', marginBottom: 0 }}>
                        Download the Shortcut file, then open it on your iPhone or Mac to add each
                        place to Apple Maps. Run the shortcut to cycle through every location.
                      </p>
                    </div>
                    <div>
                      <strong style={{ color: 'hsl(var(--foreground))' }}>
                        Google My Maps (.kml)
                      </strong>
                      <p style={{ marginTop: '0.25rem', marginBottom: 0 }}>
                        Go to{' '}
                        <a
                          href="https://www.google.com/maps/d/u/0/create"
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'hsl(var(--primary))' }}
                        >
                          My Maps
                        </a>
                        , create a new map, click <em>Import</em>, and upload the KML file.
                      </p>
                    </div>
                    <div>
                      <strong style={{ color: 'hsl(var(--foreground))' }}>Copy All Links</strong>
                      <p style={{ marginTop: '0.25rem', marginBottom: 0 }}>
                        Copies one URL per line to your clipboard. Paste into Notes or a
                        spreadsheet.
                      </p>
                    </div>
                  </div>
                </CollapsibleSection>

                {/* Cross-link */}
                <p style={{ fontSize: '0.8125rem', color: 'hsl(var(--muted-foreground))' }}>
                  Want to save to your library?{' '}
                  <Link href="/import" style={{ color: 'hsl(var(--primary))', fontWeight: 500 }}>
                    Use full import →
                  </Link>
                </p>
              </div>
            </div>

            {/* Footer */}
            <p
              style={{
                fontSize: '0.75rem',
                color: 'hsl(var(--muted-foreground))',
                textAlign: 'center',
                marginTop: '2rem',
              }}
            >
              An AppyAccidents 2026 project
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
