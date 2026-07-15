// Countries Trivia service worker — precaches the entire app so it runs
// fully offline after the first visit. Bump CACHE on every release.
const CACHE = 'countries-trivia-v5';
const ASSETS = [".","index.html","styles.css","app.js","data.js","manifest.webmanifest","icons/icon-192.png","icons/icon-512.png","icons/icon-180.png","flags/ad.svg","flags/ae.svg","flags/af.svg","flags/ag.svg","flags/ai.svg","flags/al.svg","flags/am.svg","flags/ao.svg","flags/ar.svg","flags/as.svg","flags/at.svg","flags/au.svg","flags/aw.svg","flags/ax.svg","flags/az.svg","flags/ba.svg","flags/bb.svg","flags/bd.svg","flags/be.svg","flags/bf.svg","flags/bg.svg","flags/bh.svg","flags/bi.svg","flags/bj.svg","flags/bl.svg","flags/bm.svg","flags/bn.svg","flags/bo.svg","flags/br.svg","flags/bs.svg","flags/bt.svg","flags/bw.svg","flags/by.svg","flags/bz.svg","flags/ca.svg","flags/cc.svg","flags/cd.svg","flags/cf.svg","flags/cg.svg","flags/ch.svg","flags/ci.svg","flags/ck.svg","flags/cl.svg","flags/cm.svg","flags/cn.svg","flags/co.svg","flags/cr.svg","flags/cu.svg","flags/cv.svg","flags/cw.svg","flags/cx.svg","flags/cy.svg","flags/cz.svg","flags/de.svg","flags/dj.svg","flags/dk.svg","flags/dm.svg","flags/do.svg","flags/dz.svg","flags/ec.svg","flags/ee.svg","flags/eg.svg","flags/eh.svg","flags/er.svg","flags/es.svg","flags/et.svg","flags/fi.svg","flags/fj.svg","flags/fk.svg","flags/fm.svg","flags/fo.svg","flags/fr.svg","flags/ga.svg","flags/gb.svg","flags/gd.svg","flags/ge.svg","flags/gf.svg","flags/gg.svg","flags/gh.svg","flags/gi.svg","flags/gl.svg","flags/gm.svg","flags/gn.svg","flags/gp.svg","flags/gq.svg","flags/gr.svg","flags/gs.svg","flags/gt.svg","flags/gu.svg","flags/gw.svg","flags/gy.svg","flags/hn.svg","flags/hr.svg","flags/ht.svg","flags/hu.svg","flags/id.svg","flags/ie.svg","flags/il.svg","flags/im.svg","flags/in.svg","flags/iq.svg","flags/ir.svg","flags/is.svg","flags/it.svg","flags/je.svg","flags/jm.svg","flags/jo.svg","flags/jp.svg","flags/ke.svg","flags/kg.svg","flags/kh.svg","flags/ki.svg","flags/km.svg","flags/kn.svg","flags/kp.svg","flags/kr.svg","flags/kw.svg","flags/ky.svg","flags/kz.svg","flags/la.svg","flags/lb.svg","flags/lc.svg","flags/li.svg","flags/lk.svg","flags/lr.svg","flags/ls.svg","flags/lt.svg","flags/lu.svg","flags/lv.svg","flags/ly.svg","flags/ma.svg","flags/mc.svg","flags/md.svg","flags/me.svg","flags/mf.svg","flags/mg.svg","flags/mh.svg","flags/mk.svg","flags/ml.svg","flags/mm.svg","flags/mn.svg","flags/mp.svg","flags/mq.svg","flags/mr.svg","flags/ms.svg","flags/mt.svg","flags/mu.svg","flags/mv.svg","flags/mw.svg","flags/mx.svg","flags/my.svg","flags/mz.svg","flags/na.svg","flags/nc.svg","flags/ne.svg","flags/nf.svg","flags/ng.svg","flags/ni.svg","flags/nl.svg","flags/no.svg","flags/np.svg","flags/nr.svg","flags/nu.svg","flags/nz.svg","flags/om.svg","flags/pa.svg","flags/pe.svg","flags/pf.svg","flags/pg.svg","flags/ph.svg","flags/pk.svg","flags/pl.svg","flags/pm.svg","flags/pn.svg","flags/pt.svg","flags/pw.svg","flags/py.svg","flags/qa.svg","flags/re.svg","flags/ro.svg","flags/rs.svg","flags/ru.svg","flags/rw.svg","flags/sa.svg","flags/sb.svg","flags/sc.svg","flags/sd.svg","flags/se.svg","flags/sg.svg","flags/sh.svg","flags/si.svg","flags/sj.svg","flags/sk.svg","flags/sl.svg","flags/sm.svg","flags/sn.svg","flags/so.svg","flags/sr.svg","flags/ss.svg","flags/st.svg","flags/sv.svg","flags/sx.svg","flags/sy.svg","flags/sz.svg","flags/tc.svg","flags/td.svg","flags/tg.svg","flags/th.svg","flags/tj.svg","flags/tk.svg","flags/tl.svg","flags/tm.svg","flags/tn.svg","flags/to.svg","flags/tr.svg","flags/tt.svg","flags/tv.svg","flags/tz.svg","flags/ua.svg","flags/ug.svg","flags/us.svg","flags/uy.svg","flags/uz.svg","flags/va.svg","flags/vc.svg","flags/ve.svg","flags/vg.svg","flags/vi.svg","flags/vn.svg","flags/vu.svg","flags/wf.svg","flags/ws.svg","flags/xk.svg","flags/ye.svg","flags/yt.svg","flags/za.svg","flags/zm.svg","flags/zw.svg"];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// cache-first: everything the app needs is precached; anything else falls
// through to the network and gets cached opportunistically.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // any in-scope navigation gets the app shell, so deep links work offline too
  if (e.request.mode === 'navigate') {
    e.respondWith(caches.match('./').then((hit) => hit || fetch(e.request)));
    return;
  }
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(e.request).then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return resp;
        })
    )
  );
});
