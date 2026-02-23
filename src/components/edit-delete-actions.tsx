'use client';

import { useState } from 'react';

interface EditField {
  key: string;
  label: string;
  type?: 'input' | 'textarea';
  rows?: number;
}

interface EditDeleteActionsProps {
  fields: EditField[];
  getInitialValues: () => Record<string, string>;
  onSave: (values: Record<string, string>) => Promise<boolean>;
  itemName: string;
  onDelete: () => Promise<boolean>;
  align?: 'left' | 'right';
}

export default function EditDeleteActions({
  fields,
  getInitialValues,
  onSave,
  itemName,
  onDelete,
  align = 'left',
}: EditDeleteActionsProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const alignClass = align === 'right' ? 'right-0' : 'left-0';

  const allFieldsFilled = fields.every((f) => values[f.key]?.trim());

  return (
    <div className="flex gap-2">
      <div className="relative">
        <button
          type="button"
          className="simset_button text-sm py-1! px-3!"
          onClick={() => {
            if (!editOpen) {
              setValues(getInitialValues());
            }
            setEditOpen(!editOpen);
            setDeleteOpen(false);
          }}
        >
          Edit
        </button>
        {editOpen && (
          <div className={`absolute ${alignClass} top-full mt-1 z-20 w-72 bg-(--color-bg-ivory) outline-solid outline-2 outline-(--color-primary-blue) rounded-md p-3 flex flex-col gap-2 shadow-lg`}>
            {fields.map((field) =>
              field.type === 'textarea' ? (
                <label key={field.key} className="flex flex-col gap-1 text-sm font-semibold">
                  {field.label}
                  <textarea
                    className="border border-gray-300 rounded px-2 py-1 text-sm font-normal resize-y min-h-16"
                    value={values[field.key] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                    rows={field.rows ?? 3}
                  />
                </label>
              ) : (
                <label key={field.key} className="flex flex-col gap-1 text-sm font-semibold">
                  {field.label}
                  <input
                    type="text"
                    className="border border-gray-300 rounded px-2 py-1 text-sm font-normal"
                    value={values[field.key] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                  />
                </label>
              ),
            )}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                className="text-sm px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 cursor-pointer"
                onClick={() => setEditOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="text-sm px-3 py-1 rounded bg-(--color-primary-blue) text-white hover:brightness-90 cursor-pointer disabled:opacity-50"
                disabled={saving || !allFieldsFilled}
                onClick={async () => {
                  setSaving(true);
                  try {
                    const ok = await onSave(values);
                    if (ok) setEditOpen(false);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="relative">
        <button
          type="button"
          className="simset_button text-sm py-1! px-3! bg-red-700! hover:bg-red-500!"
          onClick={() => {
            setDeleteOpen(!deleteOpen);
            setEditOpen(false);
          }}
        >
          Delete
        </button>
        {deleteOpen && (
          <div className={`absolute ${alignClass} top-full mt-1 z-20 w-64 bg-(--color-bg-ivory) outline-solid outline-2 outline-red-600 rounded-md p-3 flex flex-col gap-2 shadow-lg`}>
            <p className="text-sm font-semibold">Delete &quot;{itemName}&quot;?</p>
            <p className="text-xs text-gray-600">This action cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                className="text-sm px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 cursor-pointer"
                onClick={() => setDeleteOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="text-sm px-3 py-1 rounded bg-red-700 text-white hover:bg-red-500 cursor-pointer disabled:opacity-50"
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true);
                  try {
                    const ok = await onDelete();
                    if (ok) setDeleteOpen(false);
                  } finally {
                    setDeleting(false);
                  }
                }}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
