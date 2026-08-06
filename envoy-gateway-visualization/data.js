/* ============================================================
   Envoy Gateway visualization - content model (data only)
   ------------------------------------------------------------
   Pure data, no DOM/behavior. Consumed by app.js.

   PANELS[nodeId] describes the right-side panel for a diagram
   node. `nodeId` MUST equal the SVG node's data-node attribute
   in index.html.

   Shape:
     kind      {string}  panel title + kind chip
     badge     {string}  small chip; includes "Envoy Gateway" => blue "eg" styling
     scope     {string}  mono subtitle (e.g. "namespaced")
     control   {bool}    optional; marks a control-plane node (styling only)
     lead      {string}  intro paragraph (HTML allowed: <code>, <b>)
     fields    {[name, descHTML][]}   Shown as "Характеристики" ONLY when the
                         panel has NO manifest (physical path nodes). For CRDs
                         the Manifest tab covers spec fields, so app.js hides
                         this section to avoid duplicating it.
     refs      {[dir, verb, target, via][]}  "Связи". Rendered as a directed
                         edge SOURCE → TARGET with THIS node highlighted:
                         dir:'out' => this node is source (this → target);
                         dir:'in'  => this node is target (target → this).
                         `verb` must read active from the source's side
                         (e.g. 'out' on Controller: "управляет" GatewayClass;
                         'in' on GatewayClass: "владеет" Controller). `via` is
                         the field/edge shown as a mono chip under the edge.
     note      {string}  optional amber callout (HTML allowed)
     manifest  {object}  optional; enables the "Манифест" tab:
       yaml    {string}  YAML with key fields wrapped as
                         <span class="yk" data-f="KEY">…</span>;
                         values may use <span class="v">…</span>,
                         comments <span class="c">…</span>
       fields  {KEY: {purpose, links[], impact}}  per-field detail
                         shown under the manifest. KEY === data-f.

   STEPS drives the Traffic layer stepper (see app.js setStep).
     Index 0 = overview. Each entry:
       done    {nodeId[]}  nodes marked completed (green)
       current {{edge, node}|null}  active segment (blue)
       caption {string}    HTML caption text

   TRAFFIC_EDGES lists the cumulative traffic edge ids in path order.

   To add a node: add a PANELS[id] entry here + the matching
   <g class="node" data-node="id"> in index.html. No app.js change.
   ============================================================ */
const PANELS = {
  /* ---------------- Core Gateway API + EG CRDs ---------------- */
  gatewayclass:{
    kind:'GatewayClass', badge:'Gateway API core', scope:'cluster-scoped',
    lead:'Шаблон («класс») шлюзов, обслуживаемый конкретным контроллером. Аналог StorageClass: сам ничего не создаёт, но задаёт, какой контроллер и с какой базовой конфигурацией (EnvoyProxy) обрабатывает Gateway этого класса.',
    fields:[
      ['spec.controllerName','Идентификатор контроллера-владельца. Для EG - <code>gateway.envoyproxy.io/gatewayclass-controller</code>.'],
      ['spec.parametersRef','Ссылка на <code>EnvoyProxy</code> - базовые настройки data plane для всех Gateway класса.']
    ],
    refs:[
      ['out','ссылается на','EnvoyProxy','parametersRef'],
      ['in','выбирает класс','Gateway','gatewayClassName'],
      ['in','владеет','Controller','controllerName']
    ],
    manifest:{
      yaml:`apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: eg
spec:
  <span class="yk" data-f="controllerName">controllerName</span>: <span class="v">gateway.envoyproxy.io/gatewayclass-controller</span>
  <span class="yk" data-f="parametersRef">parametersRef</span>:
    group: gateway.envoyproxy.io
    kind: EnvoyProxy
    name: proxy-config
    namespace: envoy-gateway-system`,
      fields:{
        controllerName:{purpose:'Строка, по которой контроллер «узнаёт» свои GatewayClass и берёт их в обработку.',links:['Совпадает с controllerName, на который отвечает Envoy Gateway Controller'],impact:'Если не совпадёт - ни один контроллер не возьмёт класс, Gateway останется без data plane.',failure:'Опечатка в строке → GatewayClass не принят ни одним контроллером, статус <code>Accepted=False</code>; все Gateway этого класса зависают без подов Envoy.'},
        parametersRef:{purpose:'Указывает EnvoyProxy с базовой конфигурацией инфраструктуры прокси для всех Gateway этого класса.',links:['→ EnvoyProxy (kind: EnvoyProxy)'],impact:'Задаёт тип Service (LoadBalancer/NLB), реплики, ресурсы, телеметрию для всего класса.',failure:'Ссылка на несуществующий EnvoyProxy → применяются дефолты (ClusterIP вместо LoadBalancer), внешний вход может не подняться.'}
      }
    }
  },
  gateway:{
    kind:'Gateway', badge:'Gateway API core', scope:'namespaced',
    lead:'Конкретный экземпляр шлюза - точка входа трафика. Создание Gateway триггерит контроллер развернуть data plane: Deployment с подами Envoy и Service типа LoadBalancer.',
    fields:[
      ['spec.gatewayClassName','К какому GatewayClass принадлежит (определяет контроллер и базовый EnvoyProxy).'],
      ['spec.listeners[]','Порт, протокол, hostname, TLS и <code>allowedRoutes</code>.'],
      ['spec.infrastructure.parametersRef','Опционально свой <code>EnvoyProxy</code> для этого Gateway.']
    ],
    refs:[
      ['out','ссылается на','GatewayClass','gatewayClassName'],
      ['in','привязан к','HTTPRoute','parentRefs'],
      ['in','добавляет листенеры','ListenerSet','parentRef'],
      ['in','целится в','ClientTrafficPolicy','targetRefs']
    ],
    manifest:{
      yaml:`apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: hero-gw
spec:
  <span class="yk" data-f="gatewayClassName">gatewayClassName</span>: <span class="v">eg</span>
  <span class="yk" data-f="listeners">listeners</span>:
    - name: https
      protocol: HTTPS
      port: 443
      <span class="yk" data-f="tls">tls</span>:
        mode: Terminate
        certificateRefs:
          - kind: Secret
            name: hero-tls`,
      fields:{
        gatewayClassName:{purpose:'Привязывает Gateway к GatewayClass - так выбирается контроллер и базовый EnvoyProxy.',links:['→ GatewayClass (spec.controllerName, spec.parametersRef)'],impact:'Определяет, какой контроллер развернёт data plane и с какой инфраструктурной конфигурацией.',failure:'Имя несуществующего класса → Gateway остаётся <code>Accepted=False</code>, поды Envoy не создаются.'},
        listeners:{purpose:'Список точек прослушивания: порт, протокол, hostname, разрешённые маршруты.',links:['← HTTPRoute.parentRefs (по name листенера через sectionName)','← ClientTrafficPolicy (sectionName для конкретного листенера)'],impact:'Определяет, какие порты/протоколы открыты и какие маршруты можно привязать.',failure:'<code>allowedRoutes</code> уже, чем ожидалось → HTTPRoute не аттачится (<code>ResolvedRefs</code>/<code>Accepted=False</code>); трафик 404.'},
        tls:{purpose:'Настройка терминации TLS на листенере: режим и ссылки на сертификаты.',links:['→ Secret (certificateRefs)'],impact:'mode: Terminate - Envoy расшифровывает TLS на входе; клиентский трафик далее идёт внутри как HTTP.',failure:'Отсутствует/просрочен Secret из <code>certificateRefs</code> → листенер :443 не программируется, TLS-handshake рвётся.'}
      }
    }
  },
  listenerset:{
    kind:'ListenerSet', badge:'Gateway API v1', scope:'namespaced · опционально',
    lead:'Отдельный ресурс с дополнительными листенерами, которые прикрепляются к общему родительскому <code>Gateway</code> (можно из другого namespace). Позволяет не раздувать spec одного Gateway и раздать листенеры разным командам с собственными сертификатами и RBAC. Обходит лимит в 64 листенера на Gateway.',
    fields:[
      ['spec.parentRef','<b>Один</b> родительский <code>Gateway</code> (group/kind/name/namespace).'],
      ['spec.listeners[]','До 64 листенеров: name, protocol, port, hostname, tls, allowedRoutes.']
    ],
    refs:[
      ['out','добавляет листенеры','Gateway','parentRef'],
      ['in','привязан к','HTTPRoute','parentRefs (+ sectionName)']
    ],
    note:'API стабильно с Gateway API <b>v1.5</b> (Standard channel; ранее <code>XListenerSet</code>/<code>v1alpha1</code>). В Envoy Gateway <b>v1.7</b> был за экспериментальным флагом <code>XListenerSet</code>; с <b>v1.8</b> флаг убран - фича включается просто наличием CRD <code>ListenerSet</code>. В любом случае нужно разрешить приём на Gateway (<code>spec.allowedListeners</code>, по умолчанию запрещено). Как <code>targetRef</code> для политик EG пока не поддерживается.',
    manifest:{
      yaml:`apiVersion: gateway.networking.k8s.io/v1
kind: ListenerSet
metadata:
  name: hero-team-listeners
  namespace: team-hero
spec:
  <span class="yk" data-f="parentRef">parentRef</span>:
    group: gateway.networking.k8s.io
    kind: Gateway
    name: hero-gw
    namespace: default
  <span class="yk" data-f="listeners">listeners</span>:
    - name: hero-https
      hostname: hero.example.com
      protocol: HTTPS
      port: 443
      <span class="yk" data-f="tls">tls</span>:
        mode: Terminate
        certificateRefs:
          - kind: Secret
            name: hero-cert`,
      fields:{
        parentRef:{purpose:'Родительский Gateway, к которому прикрепляются листенеры набора. В отличие от маршрутов - <b>единственный</b> (parentRef, не parentRefs).',links:['→ Gateway (должен разрешить приём через spec.allowedListeners)'],impact:'Листенеры набора мёржатся в инфраструктуру этого Gateway; при конфликте выигрывают листенеры самого Gateway.',failure:'Gateway не разрешил namespace в <code>allowedListeners</code> (по умолчанию <code>None</code>) → набор не принят, листенеры не программируются.'},
        listeners:{purpose:'Список дополнительных листенеров (как в Gateway): порт, протокол, hostname, TLS, allowedRoutes.',links:['← HTTPRoute.parentRefs (kind: ListenerSet, по sectionName)'],impact:'Расширяет точки входа Gateway без правки его spec; имена уникальны в наборе.',failure:'Тройка (port, protocol, hostname) конфликтует с листенером Gateway или другого набора → статус <code>Conflicted</code>.'},
        tls:{purpose:'Терминация TLS на листенере набора со своими сертификатами.',links:['→ Secret (certificateRefs)'],impact:'Команда управляет своими сертификатами независимо от владельца Gateway.',failure:'Нет/просрочен Secret → листенер :443 набора не программируется.'}
      }
    }
  },
  httproute:{
    kind:'HTTPRoute', badge:'Gateway API core', scope:'namespaced',
    lead:'Правила L7-маршрутизации HTTP: как запросы с листенера Gateway распределяются по backend. Здесь живёт вся логика - матчинг host/path/header, фильтры, веса.',
    fields:[
      ['spec.parentRefs[]','К каким Gateway (и листенерам) привязан маршрут.'],
      ['spec.hostnames[]','Домены маршрута.'],
      ['spec.rules[].matches','path / header / method / query.'],
      ['spec.rules[].backendRefs','Целевые backend и веса.']
    ],
    refs:[
      ['out','привязан к','Gateway','parentRefs'],
      ['out','направляет в','Backend / Service','backendRefs'],
      ['in','целятся в','Политики','targetRefs']
    ],
    // aggregate note: several *Policy CRDs attach here - see policies layer
    manifest:{
      yaml:`apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: hero-route
spec:
  <span class="yk" data-f="parentRefs">parentRefs</span>:
    - name: hero-gw
      sectionName: https
  <span class="yk" data-f="hostnames">hostnames</span>: [<span class="v">"hero.example.com"</span>]
  rules:
    - <span class="yk" data-f="matches">matches</span>:
        - path: { type: PathPrefix, value: /api }
      <span class="yk" data-f="backendRefs">backendRefs</span>:
        - name: app-backend
          port: 8080
          weight: 100`,
      fields:{
        parentRefs:{purpose:'Привязывает маршрут к Gateway и (через sectionName) к конкретному листенеру.',links:['→ Gateway (spec.listeners[].name)'],impact:'Без совпадения по parentRef/allowedRoutes маршрут не будет принят Gateway.',failure:'Неверный <code>name</code>/<code>sectionName</code> или запрет <code>allowedRoutes</code> → маршрут не аттачится, запросы к его host отдают 404.'},
        hostnames:{purpose:'Домены, для которых действует маршрут; пересекаются с hostname листенера.',links:['× пересечение с Gateway listener hostname'],impact:'Запрос с другим Host не попадёт в этот маршрут.'},
        matches:{purpose:'Условия совпадения запроса: path, header, method, query.',links:[],impact:'Определяет, какие запросы уходят на backendRefs этого правила; на этом шаге Envoy принимает L7-решение.'},
        backendRefs:{purpose:'Целевые backend и их веса (для canary / split).',links:['→ Service (core)','→ Backend (kind: Backend, EG CRD) для не-Service backend'],impact:'weight распределяет трафик между backend; здесь начинается upstream-путь.',failure:'Service не существует или нет endpoints → <code>ResolvedRefs=False</code>, ответ 500/503; ReferenceGrant нужен для cross-namespace.'}
      }
    }
  },
  backend:{
    kind:'Backend', badge:'Envoy Gateway CRD', scope:'namespaced',
    lead:'CRD Envoy Gateway для backend, который не является k8s Service - внешний FQDN, статический IP:порт или unix-сокет. Для сервисов в кластере backendRefs указывают прямо на Service.',
    fields:[
      ['spec.type','<code>Endpoints</code> или <code>DynamicResolver</code>.'],
      ['spec.endpoints[]','Точки: <code>fqdn</code> / <code>ip</code> / <code>unix</code>.'],
      ['spec.appProtocols','Протокол приложения (h2c, ws).']
    ],
    refs:[
      ['in','направляет в','HTTPRoute','backendRefs']
    ],
    note:'Требует <code>backend.enabled: true</code> в конфиге Envoy Gateway. Иначе backendRefs указывают только на Service.',
    manifest:{
      yaml:`apiVersion: gateway.envoyproxy.io/v1alpha1
kind: Backend
metadata:
  name: external-api
spec:
  <span class="yk" data-f="type">type</span>: <span class="v">Endpoints</span>
  <span class="yk" data-f="endpoints">endpoints</span>:
    - <span class="yk" data-f="fqdn">fqdn</span>:
        hostname: api.partner.com
        port: 443
  <span class="yk" data-f="appProtocols">appProtocols</span>: [<span class="v">https</span>]`,
      fields:{
        type:{purpose:'Способ определения endpoint-ов: статические Endpoints или DynamicResolver (по DNS на лету).',links:[],impact:'Определяет, как Envoy строит upstream cluster для этого backend.'},
        endpoints:{purpose:'Список целей: FQDN, IP или unix-сокет с портом.',links:['← HTTPRoute.backendRefs (kind: Backend)'],impact:'Envoy проксирует запрос на эти адреса вместо k8s Service.'},
        fqdn:{purpose:'DNS-имя и порт внешней цели.',links:[],impact:'Envoy резолвит имя и открывает upstream-соединение; полезно для внешних API.'},
        appProtocols:{purpose:'Протокол приложения upstream (напр. https, h2c, ws).',links:[],impact:'Влияет на то, как Envoy согласует протокол с backend.'}
      }
    }
  },
  envoyproxy:{
    kind:'EnvoyProxy', badge:'Envoy Gateway CRD', scope:'namespaced', control:true,
    lead:'Конфигурация инфраструктуры data plane: как разворачивать и настраивать поды Envoy. Не участвует в маршрутизации - влияет на «форму» прокси: реплики, ресурсы, тип Service, аннотации балансировщика, телеметрию.',
    fields:[
      ['spec.provider.kubernetes','envoyDeployment / envoyService (тип LB, аннотации NLB).'],
      ['spec.bootstrap','Патчи bootstrap Envoy.'],
      ['spec.telemetry','Метрики, логи доступа, трейсинг.']
    ],
    refs:[
      ['in','ссылается на','GatewayClass','parametersRef'],
      ['in','ссылается на','Gateway','infrastructure.parametersRef']
    ],
    manifest:{
      yaml:`apiVersion: gateway.envoyproxy.io/v1alpha1
kind: EnvoyProxy
metadata:
  name: proxy-config
  namespace: envoy-gateway-system
spec:
  <span class="yk" data-f="provider">provider</span>:
    type: Kubernetes
    kubernetes:
      <span class="yk" data-f="envoyService">envoyService</span>:
        type: LoadBalancer
        annotations:
          service.beta.kubernetes.io/aws-load-balancer-type: <span class="v">nlb</span>
      <span class="yk" data-f="envoyDeployment">envoyDeployment</span>:
        replicas: 3
  <span class="yk" data-f="telemetry">telemetry</span>:
    metrics:
      prometheus: {}`,
      fields:{
        provider:{purpose:'Как провижинить data plane (обычно Kubernetes): деплой, сервис, ресурсы.',links:['← GatewayClass.parametersRef','← Gateway.infrastructure.parametersRef'],impact:'Определяет саму «оболочку» прокси, а не поведение запросов.'},
        envoyService:{purpose:'Тип и аннотации Service перед подами Envoy.',links:['→ AWS NLB через аннотации'],impact:'type: LoadBalancer + nlb-аннотация создаёт публичный AWS NLB как точку входа.'},
        envoyDeployment:{purpose:'Реплики и ресурсы Deployment подов Envoy.',links:[],impact:'replicas масштабирует data plane; влияет на пропускную способность и отказоустойчивость.'},
        telemetry:{purpose:'Метрики, access-логи, трейсинг прокси.',links:[],impact:'Включает Prometheus-метрики/логи - на маршрутизацию не влияет, только на наблюдаемость.'}
      }
    }
  },
  controller:{
    kind:'Controller', badge:'control plane', scope:'под(ы) в кластере', control:true,
    lead:'Оператор Envoy Gateway. Владеет каждым GatewayClass с совпадающим controllerName, следит за ресурсами Gateway API, транслирует их в конфигурацию Envoy и раздаёт подам прокси по xDS. Разворачивает и обновляет сам data plane.',
    fields:[
      ['watch','GatewayClass, Gateway, HTTPRoute, Backend, EnvoyProxy, политики.'],
      ['reconcile','Декларативные CRD → конфигурация Envoy.'],
      ['xDS','Раздача конфигурации подам по gRPC (LDS/RDS/CDS/EDS).']
    ],
    refs:[
      ['out','управляет','GatewayClass','controllerName'],
      ['out','создаёт','Deployment + Service','data plane']
    ]
  },

  /* ---------------- Policy CRDs ---------------- */
  clienttrafficpolicy:{
    kind:'ClientTrafficPolicy', badge:'Envoy Gateway CRD', scope:'namespaced',
    lead:'Настраивает, как клиенты подключаются к листенеру Gateway: клиентский TLS, лимиты соединений, определение client IP, таймауты. Применяется на «клиентском краю» - до маршрутизации.',
    fields:[
      ['spec.targetRefs','Только <code>Gateway</code> (можно листенер через <code>sectionName</code>).'],
      ['spec.tls','Downstream TLS (ClientTLSSettings).'],
      ['spec.connection','Лимиты/буферы соединения.'],
      ['spec.clientIPDetection','Определение реального client IP.']
    ],
    refs:[
      ['out','целится в','Gateway','targetRefs (+ sectionName)']
    ],
    note:'Привязывается <b>только к Gateway</b>, не к HTTPRoute.',
    manifest:{
      yaml:`apiVersion: gateway.envoyproxy.io/v1alpha1
kind: ClientTrafficPolicy
metadata:
  name: client-edge
spec:
  <span class="yk" data-f="targetRefs">targetRefs</span>:
    - group: gateway.networking.k8s.io
      kind: Gateway
      name: hero-gw
      <span class="yk" data-f="sectionName">sectionName</span>: https
  <span class="yk" data-f="clientIPDetection">clientIPDetection</span>:
    xForwardedFor:
      numTrustedHops: 1
  <span class="yk" data-f="connection">connection</span>:
    connectionLimit:
      value: 10000`,
      fields:{
        targetRefs:{purpose:'К какому Gateway (или листенеру) применяется политика.',links:['→ Gateway (kind: Gateway)'],impact:'Только Gateway; попытка нацелить на HTTPRoute не поддерживается.'},
        sectionName:{purpose:'Сужает действие до одного листенера Gateway.',links:['→ Gateway.spec.listeners[].name'],impact:'Позволяет разные client-настройки для :80 и :443.'},
        clientIPDetection:{purpose:'Как Envoy определяет реальный IP клиента (X-Forwarded-For / PROXY).',links:[],impact:'Влияет на логи, rate limit по IP и заголовки, видимые backend.'},
        connection:{purpose:'Лимиты и буферы клиентского соединения.',links:[],impact:'Защищает листенер от перегрузки; действует на входящем соединении, до маршрутизации.'}
      }
    }
  },
  securitypolicy:{
    kind:'SecurityPolicy', badge:'Envoy Gateway CRD', scope:'namespaced',
    lead:'AuthN/AuthZ на пути запроса: JWT, OIDC, CORS, basic/API-key auth, внешняя авторизация. Работает как фильтры внутри Envoy, до передачи на backend.',
    fields:[
      ['spec.targetRefs','<code>Gateway</code> и/или <code>HTTPRoute</code>.'],
      ['spec.jwt','Валидация JWT.'],
      ['spec.oidc','OIDC-логин.'],
      ['spec.cors / basicAuth / extAuth','CORS, basic, внешняя авторизация.']
    ],
    refs:[
      ['out','целится в','Gateway','targetRefs'],
      ['out','целится в','HTTPRoute','targetRefs']
    ],
    manifest:{
      yaml:`apiVersion: gateway.envoyproxy.io/v1alpha1
kind: SecurityPolicy
metadata:
  name: api-auth
spec:
  <span class="yk" data-f="targetRefs">targetRefs</span>:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      name: hero-route
  <span class="yk" data-f="jwt">jwt</span>:
    providers:
      - name: auth0
        remoteJWKS:
          uri: https://auth.example.com/.well-known/jwks.json
  <span class="yk" data-f="cors">cors</span>:
    allowOrigins: [<span class="v">"https://app.example.com"</span>]`,
      fields:{
        targetRefs:{purpose:'К каким Gateway или HTTPRoute применяется политика безопасности.',links:['→ Gateway','→ HTTPRoute'],impact:'На уровне Gateway - для всех маршрутов; на HTTPRoute - точечно.'},
        jwt:{purpose:'Проверка JWT-токенов через JWKS провайдера.',links:['→ внешний JWKS endpoint'],impact:'Запрос без валидного токена отклоняется внутри Envoy, backend не вызывается.',failure:'JWKS endpoint недоступен → все запросы падают в 401, даже с валидным токеном; следите за доступностью провайдера.'},
        cors:{purpose:'Правила CORS: разрешённые origin, методы, заголовки.',links:[],impact:'Envoy отвечает на preflight и добавляет CORS-заголовки; backend не трогается.'}
      }
    }
  },
  envoyextensionpolicy:{
    kind:'EnvoyExtensionPolicy', badge:'Envoy Gateway CRD', scope:'namespaced',
    lead:'Добавляет кастомные фильтры в цепочку обработки запроса: Wasm, Lua, внешний процессор (ext-proc). Расширяет логику Envoy без патчей xDS.',
    fields:[
      ['spec.targetRefs','<code>Gateway</code> и/или <code>HTTPRoute</code>.'],
      ['spec.wasm','Wasm-модули.'],
      ['spec.lua','Инлайновые Lua-скрипты.'],
      ['spec.extProc','Внешний gRPC-процессор.']
    ],
    refs:[
      ['out','целится в','Gateway','targetRefs'],
      ['out','целится в','HTTPRoute','targetRefs']
    ],
    manifest:{
      yaml:`apiVersion: gateway.envoyproxy.io/v1alpha1
kind: EnvoyExtensionPolicy
metadata:
  name: enrich
spec:
  <span class="yk" data-f="targetRefs">targetRefs</span>:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      name: hero-route
  <span class="yk" data-f="extProc">extProc</span>:
    - backendRefs:
        - name: ext-proc-svc
          port: 9000
      <span class="yk" data-f="processingMode">processingMode</span>:
        request: { body: Buffered }`,
      fields:{
        targetRefs:{purpose:'К каким Gateway/HTTPRoute подключаются кастомные фильтры.',links:['→ Gateway','→ HTTPRoute'],impact:'Определяет область, где в цепочку добавляются Wasm/Lua/ext-proc.'},
        extProc:{purpose:'Внешний gRPC-сервис, обрабатывающий запрос/ответ.',links:['→ Service / Backend (backendRefs процессора)'],impact:'Envoy вызывает внешний сервис в цепочке фильтров - можно менять/блокировать запрос.'},
        processingMode:{purpose:'Что и как отправлять во внешний процессор (заголовки/тело).',links:[],impact:'Buffered тело увеличивает задержку и память, но даёт процессору полный запрос.'}
      }
    }
  },
  backendtrafficpolicy:{
    kind:'BackendTrafficPolicy', badge:'Envoy Gateway CRD', scope:'namespaced',
    lead:'Поведение соединения Envoy → backend: балансировка, ретраи, circuit breaking, rate limit, health checks, таймауты. Действует на upstream-стороне.',
    fields:[
      ['spec.targetRefs','<code>Gateway</code> и/или <code>HTTPRoute</code>.'],
      ['spec.loadBalancer','Алгоритм балансировки.'],
      ['spec.retry / circuitBreaker','Ретраи и предохранитель.'],
      ['spec.rateLimit / healthCheck','Лимиты и проверки здоровья.']
    ],
    refs:[
      ['out','целится в','Gateway','targetRefs'],
      ['out','целится в','HTTPRoute','targetRefs']
    ],
    note:'<code>mergeType</code> нельзя задавать при таргете на Gateway.',
    manifest:{
      yaml:`apiVersion: gateway.envoyproxy.io/v1alpha1
kind: BackendTrafficPolicy
metadata:
  name: upstream-resilience
spec:
  <span class="yk" data-f="targetRefs">targetRefs</span>:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      name: hero-route
  <span class="yk" data-f="retry">retry</span>:
    numRetries: 3
    retryOn:
      triggers: [<span class="v">"5xx"</span>, <span class="v">"reset"</span>]
  <span class="yk" data-f="loadBalancer">loadBalancer</span>:
    type: LeastRequest
  <span class="yk" data-f="circuitBreaker">circuitBreaker</span>:
    maxParallelRequests: 1024`,
      fields:{
        targetRefs:{purpose:'К каким Gateway/HTTPRoute применяется upstream-политика.',links:['→ Gateway','→ HTTPRoute'],impact:'Область, где действуют ретраи/лимиты/балансировка к backend.'},
        retry:{purpose:'Условия и число повторов запроса к backend.',links:[],impact:'Повышает надёжность, но при неверных условиях усиливает нагрузку на backend.'},
        loadBalancer:{purpose:'Алгоритм распределения между endpoint backend.',links:[],impact:'LeastRequest/RoundRobin/… влияет на равномерность нагрузки на поды.'},
        circuitBreaker:{purpose:'Пороги, после которых Envoy «размыкает» цепь к backend.',links:[],impact:'Защищает backend от лавины запросов при деградации.'}
      }
    }
  },
  backendtlspolicy:{
    kind:'BackendTLSPolicy', badge:'Gateway API v1alpha3', scope:'namespaced',
    lead:'Upstream Gateway API CRD (не EG-specific). Говорит, как Envoy проверяет TLS-сертификат backend при исходящем соединении. Привязывается к Service.',
    fields:[
      ['spec.targetRefs','<code>Service</code> (core group).'],
      ['spec.validation.caCertificateRefs','CA (ConfigMap / ClusterTrustBundle).'],
      ['spec.validation.hostname','Ожидаемый hostname сертификата (SNI).'],
      ['spec.validation.wellKnownCACertificates','Напр. <code>System</code>.']
    ],
    refs:[
      ['out','целится в','Service','targetRefs']
    ],
    note:'Это upstream Gateway API (<code>gateway.networking.k8s.io/v1alpha3</code>), а не CRD Envoy Gateway.',
    manifest:{
      yaml:`apiVersion: gateway.networking.k8s.io/v1alpha3
kind: BackendTLSPolicy
metadata:
  name: backend-tls
spec:
  <span class="yk" data-f="targetRefs">targetRefs</span>:
    - group: ""
      kind: Service
      name: app-backend
  <span class="yk" data-f="validation">validation</span>:
    <span class="yk" data-f="hostname">hostname</span>: app-backend.svc
    <span class="yk" data-f="caCertificateRefs">caCertificateRefs</span>:
      - group: ""
        kind: ConfigMap
        name: backend-ca`,
      fields:{
        targetRefs:{purpose:'Service, соединение к которому должно быть по TLS с проверкой.',links:['→ Service (core group)'],impact:'Именно Service, не Gateway/Route - политика описывает upstream к сервису.'},
        validation:{purpose:'Как валидировать сертификат backend.',links:[],impact:'Определяет доверие к backend; при провале проверки соединение рвётся.'},
        hostname:{purpose:'Ожидаемое имя в сертификате backend (SNI / SAN).',links:[],impact:'Envoy проверит соответствие; несовпадение → ошибка TLS.'},
        caCertificateRefs:{purpose:'CA, которым подписан сертификат backend.',links:['→ ConfigMap / ClusterTrustBundle'],impact:'Без корректного CA Envoy не доверится backend.'}
      }
    }
  },
  envoypatchpolicy:{
    kind:'EnvoyPatchPolicy', badge:'Envoy Gateway CRD', scope:'namespaced', control:true,
    lead:'Патчит сгенерированный xDS (JSON Patch) до отдачи в Envoy - для тонких настроек, недоступных через другие CRD. Это control-plane операция, не часть пути запроса.',
    fields:[
      ['spec.targetRef','<code>Gateway</code> (или GatewayClass при mergeGateways).'],
      ['spec.type','<code>JSONPatch</code>.'],
      ['spec.jsonPatches[]','type (xDS proto) / name / operation.']
    ],
    refs:[
      ['out','целится в','Gateway','targetRef'],
      ['out','патчит','сгенерированный xDS','JSONPatch']
    ],
    note:'Требует <code>enableEnvoyPatchPolicy: true</code>. Никогда не привязывается к HTTPRoute.',
    manifest:{
      yaml:`apiVersion: gateway.envoyproxy.io/v1alpha1
kind: EnvoyPatchPolicy
metadata:
  name: tune-listener
spec:
  <span class="yk" data-f="targetRef">targetRef</span>:
    group: gateway.networking.k8s.io
    kind: Gateway
    name: hero-gw
  <span class="yk" data-f="type">type</span>: <span class="v">JSONPatch</span>
  <span class="yk" data-f="jsonPatches">jsonPatches</span>:
    - type: <span class="v">"type.googleapis.com/envoy.config.listener.v3.Listener"</span>
      name: default/hero-gw/https
      operation:
        op: add
        path: /perConnectionBufferLimitBytes
        value: 32768`,
      fields:{
        targetRef:{purpose:'Gateway, чей сгенерированный xDS будет патчиться.',links:['→ Gateway (или GatewayClass при mergeGateways)'],impact:'Определяет, к чьей конфигурации Envoy применяются патчи.'},
        type:{purpose:'Тип патча - сейчас только JSONPatch.',links:[],impact:'Фиксирует формат операций ниже.'},
        jsonPatches:{purpose:'Список правок к конкретным xDS-ресурсам (Listener/Route/Cluster). <code>name</code> адресует ресурс: до v1.10 по схеме <code>&lt;namespace&gt;/&lt;gateway&gt;/&lt;listener&gt;</code> (напр. <code>default/hero-gw/https</code>), с v1.10 по умолчанию v2-схема <code>&lt;protocol&gt;-&lt;port&gt;</code> (напр. <code>https-443</code>).',links:['→ сгенерированные xDS-ресурсы'],impact:'Прямое вмешательство в конфиг Envoy - мощно и рискованно, легко сломать прокси.',failure:'Неверный <code>name</code>/путь патча → xDS не проходит валидацию, статус <code>Programmed=False</code>, весь Gateway может остаться на старом конфиге.'}
      }
    }
  },

  /* ---------------- Traffic-layer physical nodes (no manifest) ---------------- */
  't-controller':{kind:'Controller', badge:'control plane', scope:'конфигурация, не трафик', control:true,
    lead:'Контроллер не стоит на пути пакета. Читает Gateway API-ресурсы, собирает конфигурацию Envoy и раздаёт её подам по xDS. Отдельный поток (config) - показан пунктиром.',
    fields:[['xDS gRPC','Поток обновлений конфигурации подам.'],['без трафика','Клиентские запросы через контроллер не идут.']],
    refs:[['out','конфигурирует','Envoy Proxy Pods','xDS']]},
  't-client':{kind:'Client', badge:'вне кластера', scope:'браузер / сервис',
    lead:'Внешний клиент. Резолвит DNS в адрес балансировщика и открывает TCP/TLS-соединение.',
    fields:[['DNS','Имя резолвится в адрес NLB.'],['соединение','TCP + TLS (если :443).']],
    refs:[['out','шлёт запрос','AWS NLB','шаг 1']]},
  't-nlb':{kind:'AWS NLB', badge:'Service type LB', scope:'L4 балансировщик',
    lead:'При появлении Gateway контроллер создаёт Service type LoadBalancer → в AWS это NLB (L4). Публичная точка входа, проксирует соединения на поды Envoy.',
    fields:[['тип','Service type: LoadBalancer → NLB.'],['selector','Указывает на поды Envoy.']],
    refs:[['in','получает от','Клиент','шаг 1'],['out','проксирует на','Envoy Pods','шаг 2']],
    note:'NLB работает на L4 - HTTP-маршрутизация уже внутри Envoy.'},
  't-envoy':{kind:'Envoy Proxy Pods', badge:'data plane', scope:'Deployment (managed)',
    lead:'Поды Envoy - это data plane. Принимают соединение от NLB, применяют листенер и правила HTTPRoute (L7), выбирают backend и проксируют дальше. Конфигурация - по xDS.',
    fields:[['Deployment','Один Deployment + Service на Gateway.'],['L7 routing','Матчинг host/path/header, фильтры.'],['конфиг','xDS от контроллера.']],
    refs:[['in','получает от','AWS NLB','шаг 2'],['in','конфиг от','Controller','xDS'],['out','проксирует на','Backend Service','шаг 3']]},
  't-backendsvc':{kind:'Backend Service', badge:'ClusterIP', scope:'endpoints приложения',
    lead:'Обычный k8s Service, на который указывают backendRefs из HTTPRoute. Envoy шлёт запрос на его endpoints.',
    fields:[['тип','ClusterIP; endpoints = поды.'],['ссылка','backendRefs в HTTPRoute.']],
    refs:[['in','получает от','Envoy Pods','шаг 3'],['out','направляет на','Backend Pods','шаг 4']]},
  't-backendpods':{kind:'Backend Pods', badge:'приложение', scope:'поды приложения',
    lead:'Поды приложения обрабатывают запрос и формируют ответ. Ответ идёт обратно тем же путём: под → Envoy → NLB → клиент.',
    fields:[['обработка','Бизнес-логика.'],['ответ','Обратно через Envoy к клиенту.']],
    refs:[['in','получает от','Backend Service','шаг 4']]},

  /* ---------------- Policy-layer path stages (lightweight, no manifest) ---------------- */
  'p-client':{kind:'Client', badge:'вне кластера', scope:'источник запроса',
    lead:'Клиент открывает соединение к листенеру Gateway. С этого края действует ClientTrafficPolicy.',
    fields:[['стадия','Вход соединения на листенер.']],refs:[]},
  'p-edge':{kind:'Client edge / Listener', badge:'стадия пути', scope:'приём соединения',
    lead:'Приём клиентского соединения на листенере: TLS-терминация, лимиты, определение client IP. Здесь применяется ClientTrafficPolicy (targetRef → Gateway/листенер).',
    fields:[['политики','ClientTrafficPolicy (только Gateway).']],
    refs:[['in','настраивается','ClientTrafficPolicy','targetRefs']]},
  'p-request':{kind:'Обработка запроса', badge:'стадия пути', scope:'фильтры Envoy',
    lead:'Внутри Envoy запрос проходит цепочку фильтров: аутентификация/авторизация и расширения. Здесь работают SecurityPolicy и EnvoyExtensionPolicy (Gateway или HTTPRoute).',
    fields:[['политики','SecurityPolicy, EnvoyExtensionPolicy.']],
    refs:[['in','настраивается','SecurityPolicy','targetRefs'],['in','настраивается','EnvoyExtensionPolicy','targetRefs']]},
  'p-routing':{kind:'Маршрут', badge:'стадия пути', scope:'выбор backend',
    lead:'Envoy применяет правила HTTPRoute: матчинг host/path/header и выбор backendRefs. Отсюда начинается upstream-путь.',
    fields:[['ресурс','HTTPRoute (rules/matches/backendRefs).']],
    refs:[['out','ведёт к','Upstream','backendRefs']]},
  'p-upstream':{kind:'Upstream (Envoy→backend)', badge:'стадия пути', scope:'соединение к backend',
    lead:'Исходящее соединение Envoy к backend. Здесь действуют BackendTrafficPolicy (ретраи/лимиты/балансировка) и BackendTLSPolicy (TLS к backend).',
    fields:[['политики','BackendTrafficPolicy, BackendTLSPolicy.']],
    refs:[['in','настраивается','BackendTrafficPolicy','targetRefs'],['in','TLS','BackendTLSPolicy','targetRefs → Service']]},
  'p-backend':{kind:'Backend', badge:'стадия пути', scope:'цель запроса',
    lead:'Конечная цель: k8s Service или Backend CRD (внешний FQDN/IP). Определяется backendRefs в HTTPRoute.',
    fields:[['цель','Service или Backend CRD.']],
    refs:[['in','описывается','Backend CRD','backendRefs']]},
  'p-controller':{kind:'Controller', badge:'control plane', scope:'генерация xDS', control:true,
    lead:'Собирает конфигурацию Envoy из всех CRD и политик, генерирует xDS. EnvoyPatchPolicy патчит этот вывод, EnvoyProxy задаёт инфраструктуру прокси.',
    fields:[['reconcile','CRD + политики → xDS.']],
    refs:[['in','патчится','EnvoyPatchPolicy','JSONPatch'],['in','инфраструктура','EnvoyProxy','parametersRef']]}
};

/* Policy-layer aliases → reuse full CRD panels.
   These SVG nodes (data-node) render the same panel as the core CRD. */
PANELS['p-envoyproxy'] = PANELS.envoyproxy;
PANELS['p-envoypatchpolicy'] = PANELS.envoypatchpolicy;
PANELS['p-backendcrd'] = PANELS.backend;

/* ---------------- Traffic stepper model ---------------- */
/* Cumulative traffic edge ids, in path order (client→…→backend). */
const TRAFFIC_EDGES = ['t1','t2','t3','t4'];

/* STEPS[0] = overview; STEPS[1..4] = forward path; STEPS[5] = response.
   `dir` on a step: 'fwd' (default) or 'rev' (response, amber highlight).
   `reverse:true` on the overview marks nothing.
   A step may also carry `tls:true` to pulse the TLS-termination marker. */
const STEPS = [
  {done:[],current:null,dir:'fwd',caption:'<b>Обзор.</b> Зелёным подсвечивается прямой путь запроса, янтарным - ответ назад. Пунктир сверху - конфигурация подам Envoy по xDS (не трафик). Нажимайте 1-5, чтобы пройти путь по шагам.'},
  {done:['t-client'],current:{edge:'t1',node:'t-nlb'},dir:'fwd',caption:'<span class="sc-num">Шаг 1</span><b>Клиент → NLB.</b> DNS резолвится в адрес NLB. Клиент открывает TCP-соединение и (для :443) начинает TLS-handshake к публичной точке входа.'},
  {done:['t-client','t-nlb'],current:{edge:'t2',node:'t-envoy'},dir:'fwd',tls:true,caption:'<span class="sc-num">Шаг 2</span><b>NLB → поды Envoy · TLS terminate.</b> NLB на L4 проксирует соединение на поды Envoy. <b>Именно здесь Envoy терминирует TLS</b> (по <code>listeners[].tls</code> Gateway) - дальше внутри кластера трафик идёт как расшифрованный HTTP. HTTP-маршрутизации на балансировщике нет.'},
  {done:['t-client','t-nlb','t-envoy'],current:{edge:'t3',node:'t-backendsvc'},dir:'fwd',caption:'<span class="sc-num">Шаг 3</span><b>Envoy → Backend Service (L7).</b> Внутри Envoy запрос проходит цепочку фильтров (CORS → extAuth → authN → расширения → rate limit), затем применяются правила HTTPRoute: матчинг host/path/header и выбор <code>backendRefs</code>.'},
  {done:['t-client','t-nlb','t-envoy','t-backendsvc'],current:{edge:'t4',node:'t-backendpods'},dir:'fwd',caption:'<span class="sc-num">Шаг 4</span><b>Service → Backend Pods.</b> Service балансирует запрос на поды приложения; они обрабатывают его и формируют ответ.'},
  {done:['t-client','t-nlb','t-envoy','t-backendsvc','t-backendpods'],current:null,dir:'rev',caption:'<span class="sc-num">Шаг 5</span><b>Ответ → клиенту.</b> Ответ идёт обратно тем же путём: под → Service → Envoy → NLB → клиент. Envoy повторно шифрует его в TLS на клиентском соединении. Response-фильтры (CORS-заголовки, манипуляции заголовками) применяются на обратном ходе.'},
];
