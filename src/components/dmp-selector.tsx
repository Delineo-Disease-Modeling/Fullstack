'use client';

import { useEffect, useRef, useState } from 'react';
import '@/styles/dmp-selector.css';
import useSimSettings from '@/stores/simsettings';
import useAuthStore from '@/stores/useAuthStore';

type MatrixListItem = {
  id: number;
  name: string;
  description: string;
  is_default: boolean;
  created_at: string;
  user_id: string | null;
  user: { name: string } | null;
  is_owner: boolean;
};

const BUILT_IN_VARIANTS = ['Delta'] as const;

type DialogMode = 'upload' | 'edit' | null;

type DialogState = {
  mode: DialogMode;
  target: MatrixListItem | null;
  name: string;
  description: string;
  content: string;
  error: string;
  saving: boolean;
};

const DIALOG_DEFAULTS: DialogState = {
  mode: null,
  target: null,
  name: '',
  description: '',
  content: '',
  error: '',
  saving: false
};

export default function DmpSelector() {
  const variants = useSimSettings((s) => s.variants);
  const matrixByVariant = useSimSettings((s) => s.matrix_by_variant);
  const setSettings = useSimSettings((s) => s.setSettings);
  const currentUser = useAuthStore((s) => s.user);

  const [expanded, setExpanded] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<string>(variants[0] ?? '');
  const [matrices, setMatrices] = useState<MatrixListItem[]>([]);
  const [loadingMatrices, setLoadingMatrices] = useState(true);
  const [newVariantName, setNewVariantName] = useState('');
  const [dialog, setDialog] = useState<DialogState>(DIALOG_DEFAULTS);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keep selectedVariant valid when variants list changes
  useEffect(() => {
    if (!variants.includes(selectedVariant) && variants.length > 0) {
      setSelectedVariant(variants[0]);
    }
  }, [variants, selectedVariant]);

  useEffect(() => {
    fetchMatrices();
  }, []);

  async function fetchMatrices() {
    setLoadingMatrices(true);
    try {
      const res = await fetch('/api/dmp/matrices');
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      const list: MatrixListItem[] = json.data;
      setMatrices(list);
      // Auto-assign default matrix to any variant that has no assignment
      const defaultMatrix = list.find((m) => m.is_default);
      if (defaultMatrix) {
        const current = useSimSettings.getState().matrix_by_variant;
        const updated: Record<string, number | null> = { ...current };
        let changed = false;
        for (const v of useSimSettings.getState().variants) {
          if (!(v in updated)) {
            updated[v] = defaultMatrix.id;
            changed = true;
          }
        }
        if (changed) setSettings({ matrix_by_variant: updated });
      }
    } catch {
      // silently fail — the list will just be empty
    } finally {
      setLoadingMatrices(false);
    }
  }

  // ── Variants ─────────────────────────────────────────────

  function addVariant() {
    const name = newVariantName.trim();
    if (!name || variants.includes(name) || variants.length >= 8) return;
    const nextVariants = [...variants, name];
    const defaultMatrix = matrices.find((m) => m.is_default);
    const updated = {
      ...matrixByVariant,
      [name]: defaultMatrix?.id ?? null
    };
    setSettings({ variants: nextVariants, matrix_by_variant: updated });
    setSelectedVariant(name);
    setNewVariantName('');
  }

  function removeVariant(name: string) {
    if (variants.length <= 1 || (BUILT_IN_VARIANTS as readonly string[]).includes(name)) return;
    const nextVariants = variants.filter((v) => v !== name);
    const updated = { ...matrixByVariant };
    delete updated[name];
    setSettings({ variants: nextVariants, matrix_by_variant: updated });
    if (selectedVariant === name) setSelectedVariant(nextVariants[0] ?? '');
  }

  // ── Matrix assignment ─────────────────────────────────────

  function assignMatrix(matrixId: number) {
    if (!selectedVariant) return;
    setSettings({
      matrix_by_variant: { ...matrixByVariant, [selectedVariant]: matrixId }
    });
  }

  // ── Upload dialog ─────────────────────────────────────────

  function openUpload() {
    setDialog({ ...DIALOG_DEFAULTS, mode: 'upload' });
  }

  function openEdit(matrix: MatrixListItem) {
    setDialog({
      ...DIALOG_DEFAULTS,
      mode: 'edit',
      target: matrix,
      name: matrix.name,
      description: matrix.description,
      content: ''
    });
  }

  function closeDialog() {
    setDialog(DIALOG_DEFAULTS);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setDialog((d) => ({ ...d, error: 'File exceeds the 2 MB size limit.' }));
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    const text = await file.text();
    setDialog((d) => ({ ...d, content: text, error: '' }));
  }

  async function submitDialog() {
    const { mode, target, name, description, content } = dialog;
    if (!name.trim()) {
      setDialog((d) => ({ ...d, error: 'Name is required.' }));
      return;
    }
    if (!description.trim()) {
      setDialog((d) => ({ ...d, error: 'Description is required.' }));
      return;
    }

    if (mode === 'upload' && !content.trim()) {
      setDialog((d) => ({ ...d, error: 'Please select a CSV file.' }));
      return;
    }

    setDialog((d) => ({ ...d, saving: true, error: '' }));

    try {
      if (mode === 'upload') {
        const res = await fetch('/api/dmp/matrices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), description: description.trim(), content })
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.message ?? `Upload failed (${res.status})`);
        }
        await fetchMatrices();
      } else if (mode === 'edit' && target) {
        const body: Record<string, string> = {
          name: name.trim(),
          description: description.trim()
        };
        if (content.trim()) body.content = content.trim();
        const res = await fetch(`/api/dmp/matrices/${target.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.message ?? `Update failed (${res.status})`);
        }
        await fetchMatrices();
      }
      closeDialog();
    } catch (err) {
      setDialog((d) => ({
        ...d,
        saving: false,
        error: err instanceof Error ? err.message : 'Something went wrong.'
      }));
    }
  }

  async function deleteMatrix(matrix: MatrixListItem) {
    if (!window.confirm(`Delete "${matrix.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/dmp/matrices/${matrix.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(json.message ?? 'Delete failed.');
        return;
      }
      // Unassign this matrix from any variant
      const updated = { ...matrixByVariant };
      for (const [v, mid] of Object.entries(updated)) {
        if (mid === matrix.id) updated[v] = null;
      }
      setSettings({ matrix_by_variant: updated });
      await fetchMatrices();
    } catch {
      alert('Delete failed.');
    }
  }

  const defaultMatrixId = matrices.find((m) => m.is_default)?.id ?? null;
  const assignedMatrixId = matrixByVariant[selectedVariant] ?? defaultMatrixId;

  return (
    <div className="dmps_wrap">
      <button
        type="button"
        className="dmps_toggle"
        onClick={() => setExpanded((e) => !e)}
      >
        <svg
          className={`dmps_chevron${expanded ? ' is-open' : ''}`}
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span className="dmps_title">Custom DMP Matrices</span>
        {!expanded && (
          <span className="dmps_hint_inline">— for advanced users</span>
        )}
      </button>

      <div className={`dmps_body_wrapper${expanded ? ' is-open' : ''}`}>
      <div className="dmps_body_inner">
      <div className="dmps_body">
        {/* ── Left: Variants ── */}
        <div className="dmps_panel">
          <div className="dmps_panel_header">
            <span>Variants</span>
          </div>

          <ul className="dmps_list">
            {variants.length === 0 && (
              <li className="dmps_list_empty">No variants added.</li>
            )}
            {variants.map((v) => {
              const isBuiltIn = (BUILT_IN_VARIANTS as readonly string[]).includes(v);
              return (
                <li key={v}>
                  <button
                    type="button"
                    className={`dmps_variant_row${v === selectedVariant ? ' is-selected' : ''}`}
                    onClick={() => setSelectedVariant(v)}
                  >
                    <span className="dmps_variant_dot" />
                    <span className="dmps_variant_name">{v}</span>
                    {isBuiltIn && (
                      <span className="dmps_badge dmps_badge--default">Default</span>
                    )}
                    {!isBuiltIn && matrixByVariant[v] != null && (
                      <span className="dmps_variant_badge">✓</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="dmps_adder">
            <input
              className="dmps_adder_input"
              placeholder="New variant…"
              maxLength={32}
              value={newVariantName}
              onChange={(e) => setNewVariantName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addVariant(); }}
            />
            <button
              type="button"
              className="dmps_icon_btn"
              title="Add variant"
              onClick={addVariant}
              disabled={
                !newVariantName.trim() ||
                variants.includes(newVariantName.trim()) ||
                variants.length >= 8
              }
            >
              +
            </button>
            <button
              type="button"
              className="dmps_icon_btn dmps_icon_btn--danger"
              title="Remove selected variant"
              onClick={() => removeVariant(selectedVariant)}
              disabled={
                variants.length <= 1 ||
                (BUILT_IN_VARIANTS as readonly string[]).includes(selectedVariant)
              }
            >
              −
            </button>
          </div>
        </div>

        {/* ── Right: Matrices ── */}
        <div className="dmps_panel">
          <div className="dmps_panel_header">
            <span>Matrices</span>
            <div className="dmps_panel_header_actions">
              {currentUser && (
                <button
                  type="button"
                  className="dmps_upload_btn"
                  onClick={openUpload}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  Upload
                </button>
              )}
            </div>
          </div>

          <ul className="dmps_list">
            {loadingMatrices && (
              <li className="dmps_list_empty">Loading…</li>
            )}
            {!loadingMatrices && matrices.length === 0 && (
              <li className="dmps_list_empty">No matrices found.</li>
            )}
            {matrices.map((m) => {
              const isAssigned = m.id === assignedMatrixId;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    className={`dmps_matrix_row${isAssigned ? ' is-assigned' : ''}`}
                    onClick={() => assignMatrix(m.id)}
                    title={`Assign "${m.name}" to ${selectedVariant || 'selected variant'}`}
                  >
                    <div className="dmps_matrix_info">
                      <div className="dmps_matrix_name">{m.name}</div>
                      <div className="dmps_matrix_desc">{m.description}</div>
                      <div className="dmps_matrix_meta">
                        {m.is_default && (
                          <span className="dmps_badge dmps_badge--default">Built-in</span>
                        )}
                        {m.is_owner && (
                          <span className="dmps_badge dmps_badge--mine">Yours</span>
                        )}
                        {m.user && !m.is_default && (
                          <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
                            {m.user.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <div
                      className="dmps_matrix_actions"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      {m.is_owner && !m.is_default && (
                        <>
                          <button
                            type="button"
                            className="dmps_icon_btn"
                            title="Edit matrix"
                            onClick={() => openEdit(m)}
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            className="dmps_icon_btn dmps_icon_btn--danger"
                            title="Delete matrix"
                            onClick={() => deleteMatrix(m)}
                          >
                            ✕
                          </button>
                        </>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          {!currentUser && (
            <p className="dmps_hint">Log in to upload your own matrices.</p>
          )}
        </div>
      </div>
      </div>
      </div>

      {/* ── Dialog ── */}
      {dialog.mode && (
        <div className="dmps_overlay" onClick={closeDialog}>
          <div
            className="dmps_dialog"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div className="dmps_dialog_title">
              {dialog.mode === 'upload' ? 'Upload Matrix' : 'Edit Matrix'}
            </div>

            <div className="dmps_dialog_field">
              <label className="dmps_dialog_label">Title</label>
              <input
                className="dmps_dialog_input"
                maxLength={100}
                placeholder="e.g. Custom Delta High Severity"
                value={dialog.name}
                onChange={(e) => setDialog((d) => ({ ...d, name: e.target.value }))}
              />
            </div>

            <div className="dmps_dialog_field">
              <label className="dmps_dialog_label">Description</label>
              <textarea
                className="dmps_dialog_textarea"
                maxLength={500}
                placeholder="Brief description of this matrix set…"
                value={dialog.description}
                onChange={(e) => setDialog((d) => ({ ...d, description: e.target.value }))}
              />
            </div>

            <div className="dmps_dialog_field">
              <label className="dmps_dialog_label">
                {dialog.mode === 'edit' ? 'Replace CSV (optional)' : 'CSV File'}
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              <div className="dmps_file_row">
                <button
                  type="button"
                  className="dmps_file_btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Choose file
                </button>
                <span className="dmps_file_name">
                  {dialog.content
                    ? `${dialog.content.split('\n').filter(l => l.trim() && !l.trim().startsWith('#')).length} data rows loaded`
                    : 'No file chosen'}
                </span>
              </div>
            </div>

            {dialog.error && (
              <div className="dmps_dialog_error">{dialog.error}</div>
            )}

            <div className="dmps_dialog_actions">
              <button
                type="button"
                className="dmps_dialog_cancel"
                onClick={closeDialog}
                disabled={dialog.saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dmps_dialog_submit"
                onClick={submitDialog}
                disabled={dialog.saving}
              >
                {dialog.saving ? 'Saving…' : dialog.mode === 'upload' ? 'Upload' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
