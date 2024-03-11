import CytoscapeComponent from 'react-cytoscapejs';
import React, { useEffect, useState } from 'react';

class CytoScape extends React.Component {
    render(){
      const elements = [
         { data: { id: 'one', label: 'Node 1' }, position: { x: 0, y: 0 } },
         { data: { id: 'two', label: 'Node 2' }, position: { x: 100, y: 0 } }
         //{ data: { source: 'one', target: 'two', label: 'Edge from Node1 to Node2' } }
      ];
      return <CytoscapeComponent elements={this.props.data} style={ { width: '600px', height: '600px' } } />;
    }
  }


export default function CytoGraph() {
    const [data, setData] = useState(null)
    const elements = []

    useEffect(() => {
        async function fetchJSON() {
            let a = await fetch('data/papdata.json')
            a = await a.json()
            console.log(a)
            setData(a)
        }
        fetchJSON()
        }, []);
    
    if (data != null){
        let pos = 0;
        let cbg = 401139400082;
        let homes = [];

        for (let key in data["homes"]){
            if (data["homes"][key]["cbg"] == cbg){
                elements.push({ data: { id: key, label: key }, position: { x: pos, y: 0 } })
                homes.push(key)
            }
            
            //elements.push({ data: { source: 'test', target: key, label: 'Edge from Node1 to Node2' } })
            pos+=100;
        }
        pos = 0;
        for (let key in data["people"]){
            if (homes.includes(data["people"][key]["home"])){
                elements.push({ data: { id: "p"+key, label: "person" }, position: { x: pos, y: 50 } })
                elements.push({ data: { source: "p"+key, target: data["people"][key]["home"], label: 'Edge from Node1 to Node2' } })
            }
            pos+=100;
        }
    }
    console.log(elements)
    return (
    <div>
            <CytoScape data={elements}/>
        
    </div>
    );
}