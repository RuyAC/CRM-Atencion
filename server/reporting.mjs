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
