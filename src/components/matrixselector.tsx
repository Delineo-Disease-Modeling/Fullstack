'use client';

import { useEffect, useState } from 'react';
import '@/styles/matrixselector.css';
import Button from './ui/button';

const matrix_files = ['default1.csv', 'default2.csv'];
const default_variants = ['delta', 'omicron'];

interface MatrixSelectorProps {
  customFiles: FileList | null;
  setMatrices: (matrices: Record<string, string>) => void;
}

function updateOutputDict(
  set_matrices: (m: Record<string, string>) => void,
  matrix_dict: Record<string, string>,
  def_matrices: Record<string, string>,
  custom_files: FileList | null
) {
  async function asyncHandler() {
    const updated_dict: Record<string, string> = {};
    for (const [variant, filename] of Object.entries(matrix_dict)) {
      if (matrix_files.includes(filename)) {
        updated_dict[variant] = def_matrices[filename];
      } else if (custom_files) {
        const found = Array.from(custom_files).find(
          (file) => file.name === filename
        );
        if (found) updated_dict[variant] = await found.text();
      }
    }
    set_matrices(updated_dict);
  }
  asyncHandler();
}

export default function MatrixSelector({
  customFiles,
  setMatrices
}: MatrixSelectorProps) {
  const [matrixDict, setMatrixDict] = useState<Record<string, string>>({});
  const [curVariant, setCurVariant] = useState('');
  const [curName, setCurName] = useState('');
  const [defaultMatrices, setDefaultMatrices] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    async function loadMatrices() {
      const matrix_dict: Record<string, string> = {};
      for (const filename of matrix_files) {
        const res = await fetch(`/data/matrices/${filename}`);
        matrix_dict[filename] = await res.text();
      }
      setDefaultMatrices(matrix_dict);
      const var_dict: Record<string, string> = {};
      for (let i = 0; i < Object.keys(matrix_dict).length; i++) {
        var_dict[default_variants[i]] = Object.keys(matrix_dict)[i];
      }
      setMatrixDict(var_dict);
      setCurVariant(Object.keys(var_dict)[0]);
      updateOutputDict(setMatrices, var_dict, matrix_dict, null);
    }
    loadMatrices();
  }, [setMatrices]);

  const addVariant = (variant: string) => {
    if (
      !variant.length ||
      variant in matrixDict ||
      Object.keys(matrixDict).length > 8
    )
      return;
    const newDict = {
      ...matrixDict,
      [variant]: Object.keys(defaultMatrices)[0]
    };
    setMatrixDict(newDict);
    updateOutputDict(setMatrices, newDict, defaultMatrices, customFiles);
  };

  const removeVariant = (variant: string) => {
    if (!variant.length || Object.keys(matrixDict).length === 1) return;
    const newDict = { ...matrixDict };
    delete newDict[variant];
    setMatrixDict(newDict);
    updateOutputDict(setMatrices, newDict, defaultMatrices, customFiles);
  };

  const updateSelectedMatrix = (selected: string) => {
    const newDict = { ...matrixDict, [curVariant]: selected };
    setMatrixDict(newDict);
    updateOutputDict(setMatrices, newDict, defaultMatrices, customFiles);
  };

  return (
    <div className="mselect_container">
      <div className="mselect_label">Disease Matrices</div>
      <div>
        <select
          className="mselect_selectvariant"
          size={6}
          onChange={(e) => {
            const selected = e.target.value;
            setCurVariant(selected);
            const el = document.getElementById(
              'mselect_selectmatrix'
            ) as HTMLSelectElement;
            if (el) el.value = matrixDict[selected] ?? matrix_files[0];
          }}
        >
          {Object.keys(matrixDict).map((variant, i) => (
            <option key={variant} value={variant} selected={i === 0}>
              {variant}
            </option>
          ))}
        </select>
        <select
          className="mselect_selectmatrix"
          size={6}
          id="mselect_selectmatrix"
          onChange={(e) => updateSelectedMatrix(e.target.value)}
          defaultValue={matrix_files[0]}
        >
          {matrix_files.map((file) => (
            <option key={file} value={file}>
              {file}
            </option>
          ))}
          {customFiles &&
            Array.from(customFiles).map((file) => (
              <option key={file.name} value={file.name}>
                {file.name}
              </option>
            ))}
        </select>
      </div>
      <div className="mselect_varadder">
        <input
          className="mselect_input"
          maxLength={32}
          onChange={(e) => setCurName(e.target.value)}
        />
        <Button className="w-[10%] p-0! h-5" onClick={() => addVariant(curName)}>
          +
        </Button>
        <Button
          className="w-[10%] p-0! h-5"
          onClick={() => removeVariant(curVariant)}
        >
          -
        </Button>
      </div>
    </div>
  );
}
