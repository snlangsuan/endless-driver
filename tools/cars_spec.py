# per-car shapes for carbuilder.py (front of the car toward -Y)
def S(y, w, zb, zbelt, zt, tw, kind): return (y, w, zb, zbelt, zt, tw, kind)
CARS = {
  # 90s rally coupe: two doors, rounded nose with glass headlamps either side of a small grille, round fog lamps low in the bumper,
  # big hood scoop with vents beside it, frameless door glass and a small rear quarter window, tall wing on stands
  'rally': dict(L=4.34, W=1.7, r=0.32, wb=2.52, track=0.73, belt=0.95, hlz=0.72, tlz=0.85, mirrorY=-0.62, handleY=0.36, bpil=0.66, seams=(-0.86, 0.56), grz=0.72, grw=0.4, grh=0.11, spokes=5, classic=True,
    st=[S(-2.17,0.64,0.32,0.6,0.67,0.54,'deck'), S(-2.08,0.8,0.27,0.69,0.77,0.69,'deck'), S(-1.75,0.845,0.25,0.83,0.88,0.75,'deck'), S(-1.25,0.85,0.25,0.9,0.95,0.77,'deck'),
        S(-0.92,0.85,0.25,0.93,0.97,0.77,'glassF'), S(-0.09,0.85,0.25,1.00,1.38,0.73,'roof'), S(0.35,0.85,0.25,1.01,1.39,0.68,'roof'), S(0.95,0.85,0.25,1.01,1.36,0.63,'roof'),
        S(1.38,0.845,0.26,1.01,1.0,0.74,'glassR'), S(1.85,0.83,0.29,0.95,1.0,0.74,'deck'), S(2.1,0.78,0.33,0.9,0.95,0.68,'deck'), S(2.17,0.64,0.4,0.78,0.84,0.56,'deck')]),
  # 2+2 sports coupe: long low hood between raised front fenders, cab set well back, fastback glass into a ducktail, wide rear haunches
  'fastback': dict(seams=(-0.8, 0.6), L=4.27, W=1.78, r=0.33, wb=2.575, track=0.77, belt=0.86, hlz=0.64, tlz=0.86, mirrorY=-0.66, handleY=0.25, grz=0.42, grw=1.0, grh=0.3, spokes=10, hood=(-2.05, -0.95), hooddip=0.05, sport=True,
    st=[S(-2.135,0.66,0.3,0.46,0.55,0.5,'deck'), S(-2.05,0.84,0.24,0.57,0.65,0.7,'deck'), S(-1.7,0.885,0.22,0.69,0.76,0.79,'deck'), S(-1.25,0.89,0.22,0.77,0.83,0.79,'deck'),
        S(-0.95,0.885,0.22,0.83,0.87,0.78,'glassF'), S(-0.1,0.88,0.22,0.91,1.29,0.72,'roof'), S(0.3,0.885,0.22,0.93,1.3,0.66,'roof'), S(0.62,0.89,0.23,0.95,1.25,0.6,'roof'),
        S(1.5,0.905,0.25,0.97,0.99,0.72,'glassR'), S(1.85,0.89,0.28,0.93,0.99,0.74,'deck'), S(2.06,0.82,0.32,0.92,0.975,0.7,'deck'), S(2.135,0.66,0.4,0.8,0.86,0.56,'deck')]),
  # compact crossover: long hood, big shield grille with a chrome underline, slim lamps, a roof that slopes into a steep tailgate,
  # rising waistline and thick black cladding round the wheel arches and along the sills
  'cross': dict(L=4.4, W=1.79, r=0.35, wb=2.655, track=0.78, belt=1.08, hlz=0.88, tlz=1.02, mirrorY=-0.6, handleY=-0.05, handleY2=0.95, bpil=0.35, seams=(-0.86, 0.35, 1.02), grz=0.64, grw=0.92, grh=0.3, spokes=10, sport=True, hooddip=0.03, clad=True,
    st=[S(-2.2,0.66,0.42,0.72,0.8,0.56,'deck'), S(-2.1,0.84,0.36,0.84,0.92,0.72,'deck'), S(-1.75,0.885,0.34,0.96,1.0,0.78,'deck'), S(-1.2,0.895,0.34,1.04,1.08,0.79,'deck'),
        S(-0.9,0.895,0.34,1.06,1.1,0.79,'glassF'), S(-0.07,0.89,0.34,1.13,1.53,0.75,'roof'), S(0.6,0.89,0.34,1.15,1.54,0.7,'roof'), S(1.35,0.885,0.35,1.17,1.47,0.63,'roof'),
        S(1.9,0.86,0.38,1.17,1.22,0.66,'glassR'), S(2.14,0.8,0.42,1.06,1.14,0.64,'deck'), S(2.2,0.68,0.48,0.96,1.04,0.56,'deck')]),
  'roadster': dict(seams=(-0.5, 0.48), L=3.95, W=1.73, r=0.31, wb=2.31, track=0.75, belt=0.82, hlz=0.64, tlz=0.74, mirrorY=-0.4, handleY=0.05, grz=0.42, grw=0.55, grh=0.13, spokes=6, open=True,
    st=[S(-1.975,0.66,0.3,0.48,0.54,0.52,'deck'), S(-1.88,0.82,0.24,0.6,0.67,0.7,'deck'), S(-1.5,0.86,0.23,0.73,0.78,0.76,'deck'), S(-0.75,0.86,0.23,0.8,0.84,0.76,'deck'),
        S(-0.55,0.86,0.23,0.81,0.84,0.7,'open'), S(0.55,0.86,0.23,0.82,0.83,0.7,'open'), S(0.75,0.86,0.23,0.82,0.86,0.76,'deck'),
        S(1.6,0.85,0.25,0.82,0.86,0.74,'deck'), S(1.92,0.8,0.29,0.78,0.82,0.68,'deck'), S(1.975,0.68,0.35,0.68,0.72,0.56,'deck')]),
  'coupe': dict(seams=(-0.6, 0.62), L=4.35, W=1.78, r=0.32, wb=2.45, track=0.79, belt=0.82, hlz=0.62, tlz=0.78, mirrorY=-0.32, handleY=0.25, grz=0.4, grw=0.9, grh=0.12, spokes=5, wing=True,
    st=[S(-2.175,0.72,0.28,0.42,0.48,0.6,'deck'), S(-2.06,0.86,0.24,0.54,0.6,0.74,'deck'), S(-1.6,0.89,0.24,0.7,0.74,0.8,'deck'), S(-0.95,0.89,0.24,0.8,0.83,0.8,'deck'),
        S(-0.6,0.89,0.24,0.82,0.85,0.78,'glassF'), S(0.37,0.89,0.24,0.89,1.24,0.72,'roof'), S(0.85,0.89,0.24,0.90,1.2,0.64,'roof'),
        S(1.5,0.89,0.25,0.91,0.9,0.74,'glassR'), S(1.95,0.87,0.28,0.86,0.9,0.72,'deck'), S(2.13,0.8,0.32,0.82,0.86,0.66,'deck'), S(2.175,0.7,0.36,0.72,0.78,0.58,'deck')]),
}
