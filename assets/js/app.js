const page = document.body.dataset.page;

function initCategoryFilter() {
  const categoryList = document.getElementById('category-list');
  const cards = Array.from(document.querySelectorAll('#shop-grid .shop-card'));

  if (!categoryList || !cards.length) return;

  categoryList.addEventListener('click', (event) => {
    const button = event.target.closest('.chip');
    if (!button) return;

    categoryList.querySelectorAll('.chip').forEach((chip) => chip.classList.remove('active'));
    button.classList.add('active');

    const category = button.dataset.category;
    cards.forEach((card) => {
      const services = card.dataset.services || '';
      const visible = category === 'todos' || services.includes(category);
      card.style.display = visible ? 'block' : 'none';
    });
  });
}

function initUseLocation() {
  const locationButton = document.getElementById('use-location-btn');
  if (!locationButton) return;

  locationButton.addEventListener('click', () => {
    if (!navigator.geolocation) {
      alert('Geolocalizacao nao suportada neste navegador.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      () => {
        alert('Localizacao capturada. Atualizando lava jatos proximos.');
      },
      () => {
        alert('Nao foi possivel acessar sua localizacao agora.');
      }
    );
  });
}

function initMapInteractions() {
  const mapElement = document.getElementById('map');
  const filterList = document.getElementById('map-filter-list');
  const locateButton = document.getElementById('map-locate-btn');
  const routeButton = document.getElementById('map-route-btn');
  const externalNavButton = document.getElementById('external-nav-btn');
  const shopName = document.getElementById('shop-name');
  const shopInfo = document.getElementById('shop-info');
  const params = new URLSearchParams(window.location.search);

  if (!mapElement || !filterList || !shopName || !shopInfo) return;
  if (typeof window.L === 'undefined') {
    shopInfo.textContent = 'Mapa indisponivel no momento.';
    return;
  }

  const defaultCenter = [-16.6869, -49.2648];
  const map = L.map(mapElement).setView(defaultCenter, 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  const shops = [
    {
      name: 'BlueWash Premium',
      rating: 4.8,
      category: 'lavagem',
      latlng: [-16.68, -49.26]
    },
    {
      name: 'BlackCar Studio',
      rating: 4.7,
      category: 'higienizacao',
      latlng: [-16.7, -49.25]
    },
    {
      name: 'Prime Auto Care',
      rating: 4.9,
      category: 'detalhamento',
      latlng: [-16.69, -49.28]
    }
  ];

  const markerEntries = shops.map((shop) => {
    const marker = L.marker(shop.latlng).addTo(map);
    marker.on('click', () => {
      clearRoute();
      selectShop(shop, { focus: true });
    });
    return { shop, marker, visible: true };
  });

  let userMarker = null;
  let userCircle = null;
  let currentUserPosition = null;
  let selectedShop = null;
  let routeLayer = null;
  let lastRouteSummary = '';

  function toRad(value) {
    return (value * Math.PI) / 180;
  }

  function distanceKm(from, to) {
    const earthRadiusKm = 6371;
    const dLat = toRad(to[0] - from[0]);
    const dLng = toRad(to[1] - from[1]);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(from[0])) * Math.cos(toRad(to[0])) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusKm * c;
  }

  function formatDistance(from, to) {
    const km = distanceKm(from, to);
    if (km < 1) return `${Math.round(km * 1000)} m`;
    return `${km.toFixed(1).replace('.', ',')} km`;
  }

  function formatRouteDistance(meters) {
    const km = meters / 1000;
    if (km < 1) return `${Math.round(meters)} m`;
    return `${km.toFixed(1).replace('.', ',')} km`;
  }

  function formatRouteDuration(seconds) {
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remain = minutes % 60;
    if (!remain) return `${hours}h`;
    return `${hours}h ${remain}min`;
  }

  function updateExternalNavigationLink(shop) {
    if (!externalNavButton || !shop) return;
    const destination = `${shop.latlng[0]},${shop.latlng[1]}`;
    const origin = currentUserPosition ? `&origin=${currentUserPosition[0]},${currentUserPosition[1]}` : '';
    externalNavButton.href = `https://www.google.com/maps/dir/?api=1&destination=${destination}${origin}&travelmode=driving`;
  }

  function clearRoute() {
    if (routeLayer) {
      map.removeLayer(routeLayer);
      routeLayer = null;
    }
    lastRouteSummary = '';
  }

  function selectShop(shop, options = {}) {
    const { focus = false } = options;
    selectedShop = shop;
    const distance = currentUserPosition
      ? formatDistance(currentUserPosition, shop.latlng)
      : 'distancia indisponivel';

    shopName.textContent = shop.name;
    shopInfo.innerHTML = `<span class="stars">&#9733; ${shop.rating.toFixed(1)}</span> • ${distance}${lastRouteSummary ? ` • ${lastRouteSummary}` : ''}`;
    updateExternalNavigationLink(shop);

    if (focus) {
      map.flyTo(shop.latlng, 14, { animate: true, duration: 0.8 });
    }
  }

  function applyFilter(filter) {
    markerEntries.forEach((entry) => {
      const visible = filter === 'todos' || entry.shop.category === filter;
      entry.visible = visible;

      if (visible && !map.hasLayer(entry.marker)) {
        entry.marker.addTo(map);
      }

      if (!visible && map.hasLayer(entry.marker)) {
        map.removeLayer(entry.marker);
      }
    });
  }

  function selectNearestVisibleShop() {
    const visibleShops = markerEntries.filter((entry) => entry.visible).map((entry) => entry.shop);
    if (!visibleShops.length) {
      shopName.textContent = 'Nenhum lava jato neste filtro';
      shopInfo.textContent = 'Ajuste o filtro para visualizar estabelecimentos.';
      selectedShop = null;
      clearRoute();
      return;
    }

    if (!currentUserPosition) {
      selectShop(visibleShops[0]);
      return;
    }

    let nearestShop = visibleShops[0];
    let nearestDistance = distanceKm(currentUserPosition, nearestShop.latlng);

    visibleShops.slice(1).forEach((shop) => {
      const currentDistance = distanceKm(currentUserPosition, shop.latlng);
      if (currentDistance < nearestDistance) {
        nearestDistance = currentDistance;
        nearestShop = shop;
      }
    });

    selectShop(nearestShop, { focus: false });
  }

  filterList.addEventListener('click', (event) => {
    const button = event.target.closest('.chip');
    if (!button) return;

    filterList.querySelectorAll('.chip').forEach((chip) => chip.classList.remove('active'));
    button.classList.add('active');

    applyFilter(button.dataset.filter || 'todos');
    clearRoute();
    selectNearestVisibleShop();
  });

  function locateUser(preserveSelection = false) {
    return new Promise((resolve) => {
    if (!navigator.geolocation) {
      shopInfo.textContent = 'Geolocalizacao nao suportada neste navegador.';
      resolve(false);
      return;
    }

    shopInfo.textContent = 'Buscando sua localizacao...';

    navigator.geolocation.getCurrentPosition(
      (position) => {
        currentUserPosition = [position.coords.latitude, position.coords.longitude];

        if (userMarker) {
          map.removeLayer(userMarker);
        }

        if (userCircle) {
          map.removeLayer(userCircle);
        }

        userMarker = L.marker(currentUserPosition, {
          icon: L.divIcon({
            className: 'user-marker-wrapper',
            html: '<div class="user-marker-dot" aria-hidden="true"></div>',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
          })
        }).addTo(map);

        userCircle = L.circle(currentUserPosition, {
          radius: 250,
          color: '#27c3ff',
          fillColor: '#27c3ff',
          fillOpacity: 0.12,
          weight: 1
        }).addTo(map);

        map.flyTo(currentUserPosition, 14, { animate: true, duration: 1 });
        if (!preserveSelection || !selectedShop) {
          selectNearestVisibleShop();
        } else {
          selectShop(selectedShop, { focus: false });
        }
        resolve(true);
      },
      () => {
        shopInfo.textContent = 'Nao foi possivel capturar sua localizacao. Verifique as permissoes.';
        resolve(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
    });
  }

  async function drawRouteToSelectedShop() {
    if (!selectedShop) {
      selectNearestVisibleShop();
    }

    if (!selectedShop) {
      shopInfo.textContent = 'Selecione um lava jato para calcular a rota.';
      return;
    }

    if (!currentUserPosition) {
      const located = await locateUser(true);
      if (!located) return;
    }

    const from = currentUserPosition;
    const to = selectedShop.latlng;
    const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`;

    try {
      shopInfo.textContent = 'Calculando caminho ate o lava jato...';
      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok || !data.routes || !data.routes.length) {
        throw new Error('Sem rota disponivel');
      }

      const route = data.routes[0];
      const latlngs = route.geometry.coordinates.map((coordinate) => [coordinate[1], coordinate[0]]);

      clearRoute();
      routeLayer = L.polyline(latlngs, {
        color: '#2f7fff',
        weight: 5,
        opacity: 0.9
      }).addTo(map);

      map.fitBounds(routeLayer.getBounds(), { padding: [40, 40] });
      lastRouteSummary = `rota ${formatRouteDistance(route.distance)} • ${formatRouteDuration(route.duration)}`;
      selectShop(selectedShop, { focus: false });
    } catch (error) {
      lastRouteSummary = '';
      selectShop(selectedShop, { focus: false });
      shopInfo.textContent = 'Nao foi possivel gerar a rota agora. Tente novamente.';
    }
  }

  function findShopFromQuery() {
    const queryShopName = params.get('shop');
    const destination = params.get('dest');

    if (queryShopName) {
      const matchByName = shops.find((shop) => shop.name.toLowerCase() === queryShopName.toLowerCase());
      if (matchByName) return matchByName;
    }

    if (destination) {
      const [latText, lngText] = destination.split(',');
      const lat = Number(latText);
      const lng = Number(lngText);

      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        const matchByCoordinate = shops.find((shop) => shop.latlng[0] === lat && shop.latlng[1] === lng);
        if (matchByCoordinate) return matchByCoordinate;
      }
    }

    return null;
  }

  if (locateButton) {
    locateButton.addEventListener('click', async () => {
      const located = await locateUser();
      if (located) {
        selectNearestVisibleShop();
      }
    });
  }

  if (routeButton) {
    routeButton.addEventListener('click', () => {
      drawRouteToSelectedShop();
    });
  }

  applyFilter('todos');
  const preferredShop = findShopFromQuery();
  if (preferredShop) {
    selectShop(preferredShop, { focus: true });
  } else {
    selectNearestVisibleShop();
  }

  if (params.get('route') === '1') {
    drawRouteToSelectedShop();
  }
}

function initBookingForm() {
  const form = document.getElementById('booking-form');
  const serviceInput = document.getElementById('servico');
  if (!form || !serviceInput) return;

  const params = new URLSearchParams(window.location.search);
  const selectedService = params.get('servico') || 'Lavagem completa';
  serviceInput.value = selectedService;

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const summary = [
      `Servico: ${formData.get('servico')}`,
      `Data: ${formData.get('data')}`,
      `Horario: ${formData.get('horario')}`,
      `Veiculo: ${formData.get('veiculo')}`,
    ].join('\n');

    alert(`Agendamento confirmado com sucesso.\n\n${summary}`);
    form.reset();
    serviceInput.value = selectedService;
  });
}

if (page === 'home') {
  initCategoryFilter();
  initUseLocation();
}

if (page === 'mapa') {
  initMapInteractions();
}

if (page === 'agendamento') {
  initBookingForm();
}
