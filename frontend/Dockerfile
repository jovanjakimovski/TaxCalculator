FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG APP_PROFILE=production
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
ARG VITE_COGNITO_AUTHORITY=
ARG VITE_COGNITO_HOSTED_UI_URL=
ARG VITE_SUPPORT_EMAIL=
ENV VITE_COGNITO_HOSTED_UI_URL=$VITE_COGNITO_HOSTED_UI_URL
ENV VITE_SUPPORT_EMAIL=$VITE_SUPPORT_EMAIL
ARG VITE_COGNITO_CLIENT_ID=
ARG VITE_COGNITO_REDIRECT_URI=
ARG VITE_COGNITO_LOGOUT_REDIRECT_URI=
ENV VITE_COGNITO_AUTHORITY=$VITE_COGNITO_AUTHORITY
ENV VITE_COGNITO_CLIENT_ID=$VITE_COGNITO_CLIENT_ID
ENV VITE_COGNITO_REDIRECT_URI=$VITE_COGNITO_REDIRECT_URI
ENV VITE_COGNITO_LOGOUT_REDIRECT_URI=$VITE_COGNITO_LOGOUT_REDIRECT_URI
RUN chmod +x node_modules/.bin/*
RUN case "$APP_PROFILE" in dev) npm run build:dev ;; production) npm run build ;; *) exit 1 ;; esac

FROM nginx:alpine
ARG APP_PROFILE=production
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY nginx.dev.conf /tmp/nginx.dev.conf
RUN if [ "$APP_PROFILE" = dev ]; then cp /tmp/nginx.dev.conf /etc/nginx/templates/default.conf.template; fi && rm /tmp/nginx.dev.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
