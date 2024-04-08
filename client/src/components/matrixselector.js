import React, { useEffect, useState } from 'react';

import './matrixselector.css';

// UPDATE THIS ANYTIME YOU ADD A NEW DEFAULT FILE
const matrix_files = [
  'default1.csv', 'default2.csv'
];

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

  useEffect(() => {
    async function loadMatrices() {
      var matrix_dict = {}

      for (const filename of matrix_files) {
        const res = await fetch('data/matrices/' + filename);
        matrix_dict[filename] = await res.text();
      }

      setDefaultMatrices(matrix_dict);
    }

    loadMatrices();
  }, [setDefaultMatrices]);

  return (
    <div className='mselect_container'>
      <div className='mselect_label'>
        Disease Matrices
      </div>
      <select 
        className='mselect_select' size={6} multiple
        onChange={(e) => createFileList(e.target.selectedOptions, defaultMatrices, customFiles, setMatrices)}>
        {matrix_files.map(x => 'data/'+x).map(x => <option selected value={x} key={x}>{x}</option>)}
        <CustomMatrices customFiles={customFiles}/>
      </select>
    </div>
  )
}