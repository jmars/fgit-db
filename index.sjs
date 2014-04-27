import { Repo, Person, Commit, Tag, Blob, Tree } from 'fgit'
import co from 'co'
import path from 'path'

var SystemUser = Person.create({
	name: 'system',
	email: 'none@none.com',
	date: new Date()
})

var saveJSON = function {
	case (repo, undefined, undefined) => saveJSON.bind(null, repo)
	case (repo, x, undefined) => saveJSON.bind(null, repo, x)

	case (repo, x @ String, cb) => {
		var blob = Blob.create({data:new Buffer(JSON.stringify(x))});
		repo.write(blob, cb)
	}
	
	case (repo, x @ Number, cb) => {
		var blob = Blob.create({data:new Buffer(x.toString())});
		repo.write(blob, cb)
	}
	
	case (repo, x @ Date, cb) => {
		var blob = Blob.create({data:x.toString()});
		repo.write(blob, cb)
	}

	case (repo, x @ Array, cb) => {
		var hashes; hashes = []; var end;
		for (var i = 0; i < x.length; i++) {(function(i){
			saveJSON(repo, x[i], |err, hash|{
				if (err) throw err;
				hashes.push({ mode: 777, ~hash });
				if (hashes.length === x.length) end()
			})
		})(i)};
		(end = fn () {
			repo.write(Tree.create({ entries: hashes }), cb)
		})
	}

	case (repo, x @ Object, cb) => {
		var hashes = new Object(); var end;
		for (var key in x) {
			if (x.hasOwnProperty(key)) {(function(key){
				saveJSON(repo, x[key], |err, hash|{
					hashes[key] = { mode: 777, ~hash };
					if (Object.keys(hashes).length === Object.keys(x).length) end()
				})
			})(key)}
		};
		(end = fn () {
			repo.write(Tree.create({ entries: hashes }), cb)
		})
	}
}

var readJSON = function {
	case (repo, undefined, undefined) => readJSON.bind(null, repo)
	case (repo, x, undefined) => readJSON.bind(null, repo, x)

	case (repo, x @ String, cb) => {
		repo.read(x, |err, obj|{
			readJSON(repo, obj, cb)
		})
	}

	case (repo, Blob{data}, cb) => {
		cb(null, JSON.parse(data))
	}

	case (repo, Tree{entries}, cb) => {
		var obj = new Object(), end;
		for (var key in entries) {
			if (entries.hasOwnProperty(key)) {(function(key){
				repo.read(entries[key].hash, |err, data| {
					readJSON(repo, data, |err, data|{
						obj[key] = data;
						if (Object.keys(obj).length === Object.keys(entries).length) end()
					})
				})
			})(key)}
		};
		(end = fn () {
			var arr = [];
			for (var key in obj) {
				if (obj.hasOwnProperty(key)) {
					var intKey = parseInt(key);
					if (!isNaN(intKey)) arr[intKey] = obj[key]
				}
			}
			if (Object.keys(obj).length === arr.length) {
				cb(null, arr)
			} else {
				cb(null, obj)
			}
		})
	}
}

var Store = function *(repo, name) {
	yield repo.setHead(path.join('/heads/', name));
	var tree, commit;
	try {
		commit = repo.readRef(path.join('/refs/heads/', name));
		tree = (yield repo.read(commit)).tree;
	} catch (err) {
		commit = null;
		tree = yield repo.write(Tree.create({entries:{}}));
	}
	function* set (key, val) {
		var [prefix, suffix] = [key.slice(0, 2), key.slice(2)];
		var seq = yield repo.read(tree);
		if (!seq.entries[prefix]) {
			var docs = Tree.create({ entries: {} });
			seq.entries[prefix] = {
				mode: 777,
				hash: docs
			}
		} else {
			var docs; docs = yield repo.read(seq.entries[prefix].hash)
		};
		docs.entries[suffix] = {
			mode: 777,
			hash: yield saveJSON(repo, val)
		};
		seq.entries[prefix].hash = yield repo.write(docs);
		tree = yield repo.write(seq);
	}
	function* get (key) {
		var [prefix, suffix] = [key.slice(0, 2), key.slice(2)];
		var seq = yield repo.read(tree);
		var docs = yield repo.read(seq.entries[prefix].hash);
		return yield readJSON(repo, docs.entries[suffix].hash);
	}
	function* commitf (user) {
		var person = Person.create(user);
		var newCommit; newCommit = Commit.create({
			tree: tree,
			parents: commit ? [commit] : [],
			message: 'Database Checkpoint',
			author: person,
			committer: SystemUser 
		});
		commit = yield repo.write(newCommit);
	}
	return {
		get: co(get),
		set: co(set),
		commit: co(commitf)
	}
}

module.exports = {
	Repo: Repo,
	Store: Store,
	Person: Person
}
