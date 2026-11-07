# Build context: the repository root, like the web image (compose.prod.yaml, CI).
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src/backend
# The project file alone first, so restored packages stay cached while only code changes.
COPY backend/global.json backend/Directory.Build.props ./
COPY backend/src/Erudi.Api/Erudi.Api.csproj src/Erudi.Api/
RUN dotnet restore src/Erudi.Api/Erudi.Api.csproj
COPY backend/src/Erudi.Api src/Erudi.Api
RUN dotnet publish src/Erudi.Api/Erudi.Api.csproj --configuration Release --no-restore --output /app

# Ubuntu-based: it carries the time zone database (StudyCalendar) and ICU.
FROM mcr.microsoft.com/dotnet/aspnet:10.0
# curl only serves the health check of compose.prod.yaml.
RUN apt-get update \
    && apt-get install --yes --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app .
# The image's unprivileged user. The API listens on 8080 (ASPNETCORE_HTTP_PORTS).
USER $APP_UID
EXPOSE 8080
ENTRYPOINT ["dotnet", "Erudi.Api.dll"]
