import {describe,it,expect} from 'vitest';
function overlap(a:{start:number,end:number},b:{start:number,end:number}){return a.start<b.end&&a.end>b.start}
describe('reglas de agenda',()=>{it('detecta solapamiento',()=>expect(overlap({start:9,end:10},{start:9.5,end:11})).toBe(true));it('permite turnos contiguos',()=>expect(overlap({start:9,end:10},{start:10,end:11})).toBe(false));});
