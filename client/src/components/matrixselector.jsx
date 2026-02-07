import { useEffect, useState } from 'react';

import '../styles/matrixselector.css';

// UPDATE THIS ANYTIME YOU ADD A NEW DEFAULT FILE
const matrix_files = ['default1.csv', 'default2.csv'];

const default_variants = ['delta', 'omicron'];

function CustomVariants({ matrixDict }) {
  if (!matrixDict) {
    return null;
  }

  var selected = true;
  var variant_arr = [];

  Object.keys(matrixDict).forEach((variant) => {
    variant_arr.push(
      <option selected={selected} value={variant} key={variant}>
        {variant}
      </option>
    );
    selected = false;
  });

  return variant_arr;
}

function CustomMatrices({ customFiles }) {
  var matrix_arr = [];

  matrix_files.forEach((file) => {
    matrix_arr.push(
      <option value={file} key={file}>
        {file}
      </option>
    );
  });

  if (customFiles) {
    Array.from(customFiles).forEach((file) => {
      matrix_arr.push(
        <option value={file.name} key={file.name}>
          {file.name}
        </option>
      );
    });
  }

  return matrix_arr;
}

function updateSelectedMatrix(
  cur_variant,
  selected,
  matrix_dict,
  set_matrix_dict,
  def_matrices,
  custom_files,
  set_matrices
) {
  var updated_dict = {};
  matrix_dict[cur_variant] = selected;
  Object.assign(updated_dict, matrix_dict);
  set_matrix_dict(updated_dict);

  updateOutputDict(set_matrices, matrix_dict, def_matrices, custom_files);
}

function updateOutputDict(
  set_matrices,
  matrix_dict,
  def_matrices,
  custom_files
) {
  async function asyncHandler() {
    var updated_dict = {};

    for (const [variant, filename] of Object.entries(matrix_dict)) {
      if (matrix_files.includes(filename)) {
        updated_dict[variant] = def_matrices[filename];
      } else {
        const found = Array.from(custom_files).find(
          (file) => file.name === filename
        );
        updated_dict[variant] = await found.text();
      }
    }

    set_matrices(updated_dict);
  }

  asyncHandler();
}

function addVariant(
  variant,
  matrix_dict,
  set_matrix_dict,
  set_matrices,
  def_matrices,
  custom_files
) {
  if (!variant.length) {
    return;
  }

  if (variant in matrix_dict) {
    return;
  }

  if (matrix_dict && Object.keys(matrix_dict).length > 8) {
    return;
  }

  matrix_dict[variant] = Object.keys(def_matrices)[0];

  // need to create new object so as to trigger proper re-render
  var new_dict = {};
  Object.assign(new_dict, matrix_dict);
  set_matrix_dict(new_dict);

  updateOutputDict(set_matrices, new_dict, def_matrices, custom_files);
}

function removeVariant(
  variant,
  matrix_dict,
  set_matrix_dict,
  set_matrices,
  def_matrices,
  custom_files
) {
  if (!variant.length) {
    return;
  }

  if (Object.keys(matrix_dict).length === 1) {
    return;
  }

  delete matrix_dict[variant];

  // need to create new object so as to trigger proper re-render
  var new_dict = {};
  Object.assign(new_dict, matrix_dict);
  set_matrix_dict(new_dict);

  updateOutputDict(set_matrices, new_dict, def_matrices, custom_files);
}

export default function MatrixSelector({ customFiles, setMatrices }) {
  const [matrixDict, setMatrixDict] = useState({}); // Keys are variants, values are [filename, matrix]
  const [curVariant, setCurVariant] = useState('');
  const [curName, setCurName] = useState('');
  const [defaultMatrices, setDefaultMatrices] = useState({});

  useEffect(() => {
    async function loadMatrices() {
      var matrix_dict = {};

      for (const filename of matrix_files) {
        const res = await fetch('data/matrices/' + filename);
        matrix_dict[filename] = await res.text();
      }

      setDefaultMatrices(matrix_dict);

      var var_dict = {};

      for (var i = 0; i < Object.keys(matrix_dict).length; i++) {
        var_dict[default_variants[i]] = Object.keys(matrix_dict)[i];
      }

      setMatrixDict(var_dict);
      setCurVariant(Object.keys(var_dict)[0]);
      updateOutputDict(setMatrices, var_dict, matrix_dict, []);
    }

    loadMatrices();
  }, [setMatrices]);

  return (
    <div className="mselect_container">
      <div className="mselect_label">Disease Matrices</div>

      <div>
        <select
          className="mselect_selectvariant"
          size={6}
          onChange={(e) => {
            const selected = Object.values(e.target.selectedOptions)[0].value;
            setCurVariant(selected);

            var element = document.getElementById('mselect_selectmatrix');
            element.value = matrixDict[selected] ?? matrix_files[0];
          }}
        >
          <CustomVariants matrixDict={matrixDict} />
        </select>

        <select
          className="mselect_selectmatrix"
          size={6}
          id="mselect_selectmatrix"
          onChange={(e) =>
            updateSelectedMatrix(
              curVariant,
              Object.values(e.target.selectedOptions)[0].value,
              matrixDict,
              setMatrixDict,
              defaultMatrices,
              customFiles,
              setMatrices
            )
          }
          defaultValue={matrix_files[0]}
        >
          <CustomMatrices customFiles={customFiles} />
        </select>
      </div>

      <div className="mselect_varadder">
        <input
          className="mselect_input"
          maxLength={32}
          onChange={(e) => setCurName(e.target.value)}
        ></input>
        <button
          className="mselect_button"
          onClick={() =>
            addVariant(
              curName,
              matrixDict,
              setMatrixDict,
              setMatrices,
              defaultMatrices,
              customFiles
            )
          }
        >
          +
        </button>
        <button
          className="mselect_button"
          onClick={() =>
            removeVariant(
              curVariant,
              matrixDict,
              setMatrixDict,
              setMatrices,
              defaultMatrices,
              customFiles
            )
          }
        >
          -
        </button>
      </div>
    </div>
  );
}
