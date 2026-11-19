export function localDateBoundary(value, timezone, nextDay=false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Fecha inválida.');
  const [year,month,day]=value.split('-').map(Number);
  const calendar=new Date(Date.UTC(year,month-1,day));
  if(calendar.toISOString().slice(0,10)!==value)throw new Error('Fecha inválida.');
  if(nextDay)calendar.setUTCDate(calendar.getUTCDate()+1);
  const target=calendar.getTime();let result=target;
  const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  for(let i=0;i<4;i++){
    const parts=Object.fromEntries(formatter.formatToParts(new Date(result)).map(p=>[p.type,p.value]));
    const represented=Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute,+parts.second);
    const delta=target-represented;if(!delta)return new Date(result);result+=delta;
  }
  return new Date(result);
}

export function reportDateBounds(start,end,timezone) {
  const parse=(value,isEnd)=>{
    if(!value)return isEnd?Infinity:-Infinity;
    if(/^\d{4}-\d{2}-\d{2}$/.test(value))return localDateBoundary(value,timezone,isEnd).getTime();
    if(!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))throw new Error('Fecha inválida.');
    return Date.parse(value)+(isEnd?1:0);
  };
  const bounds={start:parse(start,false),end:parse(end,true)};
  if(bounds.start>=bounds.end)throw new Error('El inicio debe ser anterior al final.');return bounds;
}

export function periodStart(period, timezone='America/La_Paz', anchor=new Date()) {
  const date=new Date(anchor);
  if(period==='all')return new Date(0);
  if(period==='week')return new Date(date.getTime()-7*86400000);
  if(period==='month')return new Date(date.getTime()-30*86400000);
  if(period==='year'){date.setUTCFullYear(date.getUTCFullYear()-1);return date;}
  if(period!=='day')throw new Error('El período no es válido.');
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const value=type=>Number(parts.find(p=>p.type===type).value);
  const midnight=Date.UTC(value('year'),value('month')-1,value('day'));
  const formatter=new Intl.DateTimeFormat('en-US',{timeZone:timezone,timeZoneName:'shortOffset'});
  function offset(at){const name=formatter.formatToParts(at).find(p=>p.type==='timeZoneName').value,match=name.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);return match?(match[1]==='-'?-1:1)*(Number(match[2])*60+Number(match[3]||0))*60000:0;}
  let result=new Date(midnight-offset(date));
  result=new Date(midnight-offset(result));
  return result;
}
