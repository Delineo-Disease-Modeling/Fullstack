import React, { useEffect, useState } from 'react';

import './matrixselector.css';

// UPDATE THIS ANYTIME YOU ADD A NEW DEFAULT FILE
const matrix_files = [
  'default1.csv', 'default2.csv'
];

// UPDATE THIS ANYTIME YOU WANT TO ADD A NEW DEFAULT VARIANT
const variant_list = [
  'delta', 'omicron'
]

function CustomVariants({ customVariants }) {
  if (!customVariants) {
    return null;
  }

  return Array.from(customVariants).map(variant => {
    return <option selected value={variant} key={variant}>{variant}</option>
  });
}

function CustomMatrices({ customFiles }) {
  if (!customFiles) {
    return null;
  }

  return Array.from(customFiles).map(file => {
    return <option value={file.name} key={file.name}>{file.name}</option>
  });
}

function createFileList(selected, defaultMatrices, customFiles, setMatrices) {
  setMatrices(null);

  async function updateFileList() {
    var filelist = []

    for (const option of Object.values(selected)) {
      if (option.value.startsWith('data/')) {
        // Default matrix values, load from variable
        filelist.push(defaultMatrices[option.value.substring(5)]);
      } else {
        const found = Array.from(customFiles).find(file => file.name === option.value);
        filelist.push(await found.text());
      }
    }
  
    setMatrices(filelist)
  }

  updateFileList();
}

export default function MatrixSelector({ customFiles, setMatrices }) {
  const [defaultMatrices, setDefaultMatrices] = useState({});
  const [variants, setVariants] = useState([]);
  const [curVariant, setCurVariant] = useState(null);

  useEffect(() => {
    async function loadMatrices() {
      var matrix_dict = {}

      for (const filename of matrix_files) {
        const res = await fetch('data/matrices/' + filename);
        matrix_dict[filename] = await res.text();
      }

      setDefaultMatrices(matrix_dict);
    }

    setVariants(variant_list);
    loadMatrices();
  }, [setDefaultMatrices, setVariants]);

  return (
    <div className='mselect_container'>
      <div className='mselect_label'>
        Disease Matrices
      </div>

      <div>
        <select
          className='mselect_selectvariant' size={6}
          onChange={(e) => setCurVariant(Object.values(e.target.selectedOptions)[0].value)}>
          <CustomVariants customVariants={variants}/>
        </select>

        <select 
          className='mselect_selectmatrix' size={6}
          onChange={(e) => createFileList(e.target.selectedOptions, defaultMatrices, customFiles, setMatrices)}>
          {matrix_files.map(x => 'data/'+x).map(x => <option selected value={x} key={x}>{x}</option>)}
          <CustomMatrices customFiles={customFiles}/>
        </select>
      </div>

      <div className='mselect_varadder'>
        <input></input>
        <button className='mselect_button'>+</button>
        <button className='mselect_button'>-</button>
      </div>
    </div>
  )
}