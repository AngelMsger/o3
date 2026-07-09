export namespace config {
	
	export class Prefs {
	    theme: string;
	    accent: string;
	    density: string;
	
	    static createFrom(source: any = {}) {
	        return new Prefs(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.theme = source["theme"];
	        this.accent = source["accent"];
	        this.density = source["density"];
	    }
	}

}

export namespace ecosystem {
	
	export class CLIStatus {
	    installed: boolean;
	    version: string;
	    path: string;
	    managed: string;
	    latestVersion: string;
	    updateAvailable: boolean;
	
	    static createFrom(source: any = {}) {
	        return new CLIStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.installed = source["installed"];
	        this.version = source["version"];
	        this.path = source["path"];
	        this.managed = source["managed"];
	        this.latestVersion = source["latestVersion"];
	        this.updateAvailable = source["updateAvailable"];
	    }
	}
	export class SkillStatus {
	    installed: boolean;
	    version: string;
	    agents: string[];
	
	    static createFrom(source: any = {}) {
	        return new SkillStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.installed = source["installed"];
	        this.version = source["version"];
	        this.agents = source["agents"];
	    }
	}
	export class EcoStatus {
	    npmAvailable: boolean;
	    cli: CLIStatus;
	    skill: SkillStatus;
	
	    static createFrom(source: any = {}) {
	        return new EcoStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.npmAvailable = source["npmAvailable"];
	        this.cli = this.convertValues(source["cli"], CLIStatus);
	        this.skill = this.convertValues(source["skill"], SkillStatus);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace main {
	
	export class ConnConfig {
	    name: string;
	    url: string;
	    org: string;
	    scheme: string;
	    username: string;
	    secret: string;
	    origName: string;
	
	    static createFrom(source: any = {}) {
	        return new ConnConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.url = source["url"];
	        this.org = source["org"];
	        this.scheme = source["scheme"];
	        this.username = source["username"];
	        this.secret = source["secret"];
	        this.origName = source["origName"];
	    }
	}
	export class ConnInfo {
	    orgCount: number;
	    streamCount: number;
	
	    static createFrom(source: any = {}) {
	        return new ConnInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.orgCount = source["orgCount"];
	        this.streamCount = source["streamCount"];
	    }
	}
	export class ContextInfo {
	    name: string;
	    url: string;
	    org: string;
	    scheme: string;
	    username: string;
	    hasSecret: boolean;
	    isCurrent: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ContextInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.url = source["url"];
	        this.org = source["org"];
	        this.scheme = source["scheme"];
	        this.username = source["username"];
	        this.hasSecret = source["hasSecret"];
	        this.isCurrent = source["isCurrent"];
	    }
	}
	export class Field {
	    name: string;
	    type: string;
	
	    static createFrom(source: any = {}) {
	        return new Field(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.type = source["type"];
	    }
	}
	export class StreamInfo {
	    name: string;
	    streamType: string;
	    docs: number;
	    size: string;
	
	    static createFrom(source: any = {}) {
	        return new StreamInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.streamType = source["streamType"];
	        this.docs = source["docs"];
	        this.size = source["size"];
	    }
	}

}

export namespace metrics {
	
	export class Params {
	    promql: string;
	    startMicros: number;
	    endMicros: number;
	
	    static createFrom(source: any = {}) {
	        return new Params(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.promql = source["promql"];
	        this.startMicros = source["startMicros"];
	        this.endMicros = source["endMicros"];
	    }
	}
	export class Point {
	    t: number;
	    v: number;
	
	    static createFrom(source: any = {}) {
	        return new Point(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.t = source["t"];
	        this.v = source["v"];
	    }
	}
	export class Series {
	    name: string;
	    labels: Record<string, string>;
	    points: Point[];
	
	    static createFrom(source: any = {}) {
	        return new Series(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.labels = source["labels"];
	        this.points = this.convertValues(source["points"], Point);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Result {
	    series: Series[];
	    step: string;
	
	    static createFrom(source: any = {}) {
	        return new Result(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.series = this.convertValues(source["series"], Series);
	        this.step = source["step"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace query {
	
	export class Bucket {
	    t: string;
	    h: number;
	    c: number;
	
	    static createFrom(source: any = {}) {
	        return new Bucket(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.t = source["t"];
	        this.h = source["h"];
	        this.c = source["c"];
	    }
	}
	export class KV {
	    k: string;
	    v: string;
	    kind: string;
	
	    static createFrom(source: any = {}) {
	        return new KV(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.k = source["k"];
	        this.v = source["v"];
	        this.kind = source["kind"];
	    }
	}
	export class LogRow {
	    id: string;
	    time: string;
	    level: string;
	    service: string;
	    body: string;
	    ltype: string;
	    trace: string;
	    json: KV[];
	
	    static createFrom(source: any = {}) {
	        return new LogRow(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.time = source["time"];
	        this.level = source["level"];
	        this.service = source["service"];
	        this.body = source["body"];
	        this.ltype = source["ltype"];
	        this.trace = source["trace"];
	        this.json = this.convertValues(source["json"], KV);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class QueryMeta {
	    total: number;
	    tookMs: number;
	    scanBytes: number;
	
	    static createFrom(source: any = {}) {
	        return new QueryMeta(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.total = source["total"];
	        this.tookMs = source["tookMs"];
	        this.scanBytes = source["scanBytes"];
	    }
	}
	export class SearchParams {
	    stream: string;
	    sql: string;
	    startMicros: number;
	    endMicros: number;
	    from: number;
	    size: number;
	    histogram: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SearchParams(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.stream = source["stream"];
	        this.sql = source["sql"];
	        this.startMicros = source["startMicros"];
	        this.endMicros = source["endMicros"];
	        this.from = source["from"];
	        this.size = source["size"];
	        this.histogram = source["histogram"];
	    }
	}
	export class SearchResult {
	    meta: QueryMeta;
	    rows: LogRow[];
	    histogram: Bucket[];
	
	    static createFrom(source: any = {}) {
	        return new SearchResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.meta = this.convertValues(source["meta"], QueryMeta);
	        this.rows = this.convertValues(source["rows"], LogRow);
	        this.histogram = this.convertValues(source["histogram"], Bucket);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

