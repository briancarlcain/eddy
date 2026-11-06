import { shortOf } from './names.js';
import React, { useMemo, useState } from 'react';
import { costLines, priceText } from './gearCost.js';

const usd = (n) => '$' + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd0 = (n) => '$' + Math.round(n || 0).toLocaleString();
const PAL = ['#1f6c9f', '#c46a2d', '#4f8a5b', '#8a5fa8', '#b8942a', '#c0506a'];
const OTHER = '#8b97a3';
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

function Bar({ parts, total }) {
  return (
    <div className="cbBar" role="img" aria-label="Cost split">
      {parts.map((p) => (
        <span key={p.k} style={{ width: (total > 0 ? (p.v / total) * 100 : 0) + '%', background: p.c }} />
      ))}
    </div>
  );
}

// Interactive breakdown of what the gear costs: the whole group or one person
export default function GearCost({ L, crew, start }) {
  const [pid, setPid] = useState(start || 'group');
  const [cat, setCat] = useState(null);
  const [sort, setSort] = useState('cost');
  const [open, setOpen] = useState(null);
  const grp = pid === 'group' || !crew.some((c) => c.id === pid);
  const me = grp ? null : crew.find((c) => c.id === pid);
  const people = [...crew].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const amt = (it) => (grp ? it.total : it.share[pid] || 0);
  const total = grp ? L.total : (L.by[pid] || {}).total || 0;
  const rows = useMemo(() => L.items.filter((i) => amt(i) > 0.005), [L, pid]);
  const cats = useMemo(() => {
    const m = {};
    rows.forEach((i) => (m[i.cat] = (m[i.cat] || 0) + amt(i)));
    const all = Object.entries(m).sort((a, b) => b[1] - a[1]);
    const top = all.slice(0, PAL.length).map(([k, v], j) => ({ k, v, c: PAL[j] }));
    const rest = all.slice(PAL.length).reduce((a, [, v]) => a + v, 0);
    return rest > 0.005 ? [...top, { k: 'Other', v: rest, c: OTHER, other: all.slice(PAL.length).map(([k]) => k) }] : top;
  }, [rows]);
  const catOf = (i) => cats.find((c) => c.k === i.cat || (c.other && c.other.includes(i.cat)));
  const catSel = cats.find((c) => c.k === cat);
  const shown = rows
    .filter((i) => !catSel || (catSel.other ? catSel.other.includes(i.cat) : i.cat === catSel.k))
    .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'cat' ? a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name) : amt(b) - amt(a) || a.name.localeCompare(b.name)));
  const max = Math.max(0, ...rows.map(amt));
  const attn = L.items.filter((i) => i.issues.length).length;
  const b = me ? L.by[pid] : null;
  const byPerson = people.map((c) => ({ c, v: (L.by[c.id] || {}).total || 0 })).sort((a, z) => z.v - a.v);
  const maxP = Math.max(0, ...byPerson.map((x) => x.v));
  const pick = (v) => {
    setPid(v);
    setCat(null);
    setOpen(null);
  };

  return (
    <div className="cb">
      <select className="sel" aria-label="Whose costs" value={grp ? 'group' : pid} onChange={(e) => pick(e.target.value)}>
        <option value="group">The group</option>
        {people.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <div className="cbHero">
        <div className="cbNum">{usd(total)}</div>
        <div className="cbKey">{grp ? 'Trip gear cost' : `${me.name}’s share`}</div>
        <div className="muted">
          {rows.length} {rows.length === 1 ? 'item' : 'items'}
          {grp ? '' : ` · ${pct(total, L.total)}% of the trip total`}
        </div>
      </div>

      {attn > 0 && (
        <div className="gwarn">
          {attn} {attn === 1 ? 'item needs' : 'items need'} attention on the Gear tab. These numbers may change.
        </div>
      )}
      {grp && L.loose > 0.005 && (
        <div className="cbLoose">
          <span>Not assigned to anyone yet</span>
          <b>{usd(L.loose)}</b>
        </div>
      )}
      {b && b.total > 0.005 && (
        <>
          <Bar
            total={b.total}
            parts={[
              { k: 'own', v: b.personal, c: PAL[0] },
              { k: 'shared', v: b.total - b.personal, c: PAL[1] },
            ]}
          />
          <div className="cbLegend two">
            <span><i style={{ background: PAL[0] }} />Only for {shortOf(crew, me.id) || me.name.split(' ')[0]} <b>{usd(b.personal)}</b></span>
            <span><i style={{ background: PAL[1] }} />Split with others <b>{usd(b.total - b.personal)}</b></span>
          </div>
        </>
      )}

      {rows.length === 0 ? (
        <div className="muted mt">No rental costs yet.</div>
      ) : (
        <>
          <span className="label mt">By category</span>
          <Bar parts={cats} total={total} />
          <div className="cbCats">
            {cats.map((c) => (
              <button key={c.k} className={'cbCat' + (cat === c.k ? ' on' : '')} aria-pressed={cat === c.k} onClick={() => setCat(cat === c.k ? null : c.k)}>
                <i style={{ background: c.c }} />
                <span className="cbCatName">{c.k}</span>
                <span className="muted">{pct(c.v, total)}%</span>
                <b>{usd(c.v)}</b>
              </button>
            ))}
          </div>

          {grp && byPerson.length > 1 && (
            <>
              <span className="label mt">By person</span>
              {byPerson.map(({ c, v }) => (
                <button key={c.id} className="cbPerson" onClick={() => pick(c.id)}>
                  <span className="cbPName">{c.name}</span>
                  <span className="cbTrack"><span style={{ width: (maxP > 0 ? (v / maxP) * 100 : 0) + '%' }} /></span>
                  <b>{usd0(v)}</b>
                </button>
              ))}
            </>
          )}

          <div className="cbHead mt">
            <span className="label">{catSel ? catSel.k : 'All items'} · {shown.length}</span>
            <span className="cbSort">
              {[['cost', 'Cost'], ['name', 'Name'], ['cat', 'Category']].map(([k, l]) => (
                <button key={k} className={'cbSortBtn' + (sort === k ? ' on' : '')} aria-pressed={sort === k} onClick={() => setSort(k)}>
                  {l}
                </button>
              ))}
            </span>
          </div>
          {shown.map((i) => (
            <Item key={i.id} i={i} v={amt(i)} max={max} color={(catOf(i) || {}).c} open={open === i.id} onOpen={() => setOpen(open === i.id ? null : i.id)} L={L} crew={crew} pid={grp ? null : pid} />
          ))}
        </>
      )}
    </div>
  );
}

function Item({ i, v, max, color, open, onOpen, L, crew, pid }) {
  const price = priceText(i, L.days);
  const payers = crew.map((c) => ({ c, v: i.share[c.id] || 0 })).filter((x) => x.v > 0.005).sort((a, b) => b.v - a.v);
  const lines = pid ? costLines(i, crew, L.nights, pid) : [];
  const qty = (n) => +n.toFixed(2);
  return (
    <div className={'cbItem' + (open ? ' open' : '')}>
      <button className="cbItemHead" aria-expanded={open} onClick={onOpen}>
        <span className="cbItemText">
          <span className="cbItemName">{i.name}</span>
          <span className="muted">{i.cat}</span>
        </span>
        <b>{usd(v)}</b>
        <span className="cbTrack wide"><span style={{ width: (max > 0 ? (v / max) * 100 : 0) + '%', background: color }} /></span>
      </button>
      {open && (
        <div className="cbDetail">
          <div className="cbRow"><span>Rented</span><span>{qty(i.rent)} {i.rent === 1 ? 'unit' : 'units'}</span></div>
          {price && <div className="cbRow"><span>Price each</span><span>{price}{i.unit > 0 && price.includes('/day') ? ` = ${usd(i.unit)}` : ''}</span></div>}
          <div className="cbRow"><span>Group total</span><span>{usd(i.total)}</span></div>
          {pid ? (
            <>
              <div className="cbSub">What you pay</div>
              {lines.map((x, k) => (
                <div className="cbRow" key={k}>
                  <span>
                    {x.all
                      ? `Split by everyone${i.split === 'nights' ? ' by nights' : ' evenly'}`
                      : x.with.length
                        ? `${qty(x.n) === 1 ? '1 unit' : qty(x.n) + ' of a unit'} with ${x.with.map(first).join(', ')}${i.split === 'nights' ? ', by nights' : ''}`
                        : `${qty(x.units)} ${x.units === 1 ? 'unit' : 'units'} just for you`}
                  </span>
                  <span>{usd(x.amount)}</span>
                </div>
              ))}
            </>
          ) : (
            <>
              <div className="cbSub">Who pays</div>
              {payers.map(({ c, v: pv }) => (
                <div className="cbRow" key={c.id}>
                  <span>{c.name}</span>
                  <span>{usd(pv)}</span>
                </div>
              ))}
              {i.loose > 0.005 && (
                <div className="cbRow warn">
                  <span>Not assigned yet</span>
                  <span>{usd(i.loose)}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
