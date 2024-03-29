import CytoscapeComponent from 'react-cytoscapejs';
import React, { useEffect, useState } from 'react';

class CytoScape extends React.Component {
    render(){
      return <CytoscapeComponent elements={this.props.data} style={ { width: '1500px', height: '600px' } } />;
    }
  }


export default function CytoGraph() {
    const [papData, setPapData] = useState(null)
    const [patData, setPatData] = useState(null)
    const [tData, settData] = useState(null)
    const elements = []

    useEffect(() => {
        async function fetchJSON() {
            let a = await fetch('data/papdata.json')
            let p = await fetch('data/patterns.json')
            let t = await fetch('data/pattern_simple.json')
            a = await a.json()
            p = await p.json()
            t = await t.json()
            console.log(a)
            console.log(p)
            console.log("t")
            console.log(t)
            setPapData(a)
            setPatData(p)
            settData(t)
        }
        fetchJSON()
        }, []);
    if (papData != null && patData != null){
        let pos = 0;
        let cbg = 401139400082;
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
    <div>
            <CytoScape data={elements}/>
        
    </div>
    );
}