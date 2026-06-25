export namespace main {
	
	export class ConnConfig {
	    url: string;
	    org: string;
	    scheme: string;
	    username: string;
	    secret: string;
	
	    static createFrom(source: any = {}) {
	        return new ConnConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.url = source["url"];
	        this.org = source["org"];
	        this.scheme = source["scheme"];
	        this.username = source["username"];
	        this.secret = source["secret"];
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

export namespace query {
	
	export class Bucket {
	    t: string;
	    h: number;
	
	    static createFrom(source: any = {}) {
	        return new Bucket(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.t = source["t"];
	        this.h = source["h"];
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

