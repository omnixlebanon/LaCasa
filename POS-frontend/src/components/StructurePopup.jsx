import {useEffect,useRef} from "react";
import {createPortal} from "react-dom";
import MenuStructure from "./MenuStructure.jsx";
export default function StructurePopup({kind,onClose,onChanged,initialGroups,initialCategories}){
    const ref=useRef(null);
    useEffect(()=>{ref.current.showModal();},[]);
    return createPortal(<dialog ref={ref} className="menu-structure-dialog" aria-label={kind==='groups'?'Manage groups':'Manage categories'} onCancel={onClose} onClose={onClose}><header><h2>{kind==='groups'?'Manage groups':'Manage categories'}</h2><button type="button" aria-label="Close management" onClick={onClose}>Close</button></header><MenuStructure groupsOnly={kind==='groups'} categoriesOnly={kind==='categories'} onChanged={onChanged} initialGroups={initialGroups} initialCategories={initialCategories}/></dialog>,document.body);
}
