
# osmium-tool 1.16; the osrm-* steps follow OSRM's official quick start. Build it once locally before relying on it:
#     docker build -t kapita-osrm osrm/ && docker run --rm -p 5000:5000 kapita-osrm
#     curl "http://localhost:5000/route/v1/driving/7.4951,9.0765;7.5300,9.0500"      (longitude FIRST, then latitude)

# ---- stage 1: download Nigeria and cut out just the cities the app serves ----------------------------------------
# OSRM's memory use and build time grow with the size of the map. Abuja + Lagos is a small fraction of Nigeria.
FROM debian:bookworm-slim AS crop
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates osmium-tool \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /data
ARG PBF_URL=https://download.geofabrik.de/africa/nigeria-latest.osm.pbf
# Boxes are LEFT,BOTTOM,RIGHT,TOP (longitude,latitude): the import boxes plus ~0.1 degree so rides near the edge still route.
# Build with --build-arg CROP=false to keep all of Nigeria (needs much more memory).
ARG CROP=true
ARG ABUJA_BBOX=7.05,8.75,7.75,9.35
ARG LAGOS_BBOX=2.60,6.20,3.85,6.90
RUN curl -fsSL "$PBF_URL" -o nigeria.osm.pbf \
 && if [ "$CROP" = "true" ]; then \
      osmium extract -b "$ABUJA_BBOX" nigeria.osm.pbf -o abuja.osm.pbf \
   && osmium extract -b "$LAGOS_BBOX" nigeria.osm.pbf -o lagos.osm.pbf \
   && osmium merge abuja.osm.pbf lagos.osm.pbf -o region.osm.pbf; \
    else mv nigeria.osm.pbf region.osm.pbf; fi \
 && rm -f nigeria.osm.pbf abuja.osm.pbf lagos.osm.pbf

# ---- stage 2: turn the map into OSRM's routing files (this step needs the most RAM) -------------------------------
FROM ghcr.io/project-osrm/osrm-backend AS build
COPY --from=crop /data/region.osm.pbf /data/region.osm.pbf
RUN osrm-extract -p /opt/car.lua /data/region.osm.pbf \
 && osrm-partition /data/region.osrm \
 && osrm-customize /data/region.osrm \
 && rm /data/region.osm.pbf

# ---- stage 3: small runtime image that only serves routes --------------------------------------------------------
FROM ghcr.io/project-osrm/osrm-backend
COPY --from=build /data /data
EXPOSE 5000
CMD ["osrm-routed", "--algorithm", "mld", "--port", "5000", "/data/region.osrm"]
