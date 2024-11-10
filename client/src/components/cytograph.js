import CytoscapeComponent from 'react-cytoscapejs';
import React, { useEffect, useState } from 'react';

import './cytograph.css'

export default function CytoGraph({ sim_data, move_patterns, pap_data }) {
	const [ papData, setPapData ] = useState(null);
	const [ patData, setPatData ] = useState(null);

	const elements = [];

	useEffect(() => {
		setPapData(pap_data);
		setPatData(move_patterns);
	}, [ pap_data, move_patterns ]);

	if (papData != null && patData != null){
		let pos = 0;
		// let cbg = 401139400082;
		let homes = [];
		let prevHomes = {}

		for (let key in papData["homes"]){
			if (parseInt(key)<=5){
				for (let i = 1; i < Object.keys(patData).length+1; i++){
					elements.push({ data: { id: key+"t"+(i*60), label: key }, position: { x: pos, y: i*500 } })
				}

				homes.push(key)
			}
			pos+=200;
		}
		
		for (let time in patData){
			let curHomes = {}
			for (let home in patData[time]["homes"]){
				if (parseInt(home)<=5){
					for(let person in patData[time]['homes'][home]){
						if (patData[time]['homes'][home][person] in prevHomes){
							elements.push({ data: { source: home+"t"+time, target: prevHomes[patData[time]['homes'][home][person]]+"t"+(parseInt(time)-60), label: 'Edge from Node1 to Node2' } })
						}       

						curHomes[patData[time]['homes'][home][person]] = home
					}
				}
			}
			
			prevHomes = curHomes
		}
	}
    
	return (
		<div className='cytograph_chart'>
			<CytoscapeComponent 
				elements={elements} 
				style={ { width: '100%', height: '100%' } } 
				pan={ {x: 300, y: 0} } 
				zoom={0.25} 
			/>
		</div>
	);
}