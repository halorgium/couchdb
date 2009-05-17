// Licensed under the Apache License, Version 2.0 (the "License"); you may not
// use this file except in compliance with the License.  You may obtain a copy
// of the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
// WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.  See the
// License for the specific language governing permissions and limitations under
// the License.

couchTests.delayed_commits = function(debug) {
  var db = new CouchDB("test_suite_db");
  db.deleteDb();
  db.createDb();
  if (debug) debugger;
  
  // By default, couchdb doesn't fully commit documents to disk right away,
  // it waits about a second to batch the full commit flush along with any 
  // other updates. If os crashes you may lose the most
  // recent commits.
  
  T(db.save({_id:"1",a:2,b:4}).ok);
  T(db.open("1") != null);
  
  restartServer();
  
  T(db.open("1") != null);
  
  var db2 = new CouchDB("test_suite_db", {"X-Couch-Full-Commit":"true"});
  
  T(db2.save({_id:"2",a:2,b:4}).ok);
  T(db2.open("2") != null);
  
  restartServer();
  
  T(db2.open("2") != null);
  
  // You can update but without committing immediately, and then ensure
  // everything is commited in the last step.
  
  T(db.save({_id:"3",a:2,b:4}).ok);
  T(db.open("3") != null);
  T(db.ensureFullCommit().ok);
  restartServer();
  
  T(db.open("3") != null);
  
  // However, it's possible even when flushed, that the server crashed between
  // the update and the commit, and you don't want to check to make sure
  // every doc you updated actually made it to disk. So record the instance
  // start time of the database before the updates and then check it again
  // after the flush (the instance start time is returned by the flush
  // operation). if they are the same, we know everything was updated
  // safely.
  
  // First try it with a crash.
  
  var instanceStartTime = db.info().instance_start_time;
  
  T(db.save({_id:"4",a:2,b:4}).ok);
  T(db.open("4") != null);
  
  restartServer();
  
  var commitResult = db.ensureFullCommit();
  T(commitResult.ok && commitResult.instance_start_time != instanceStartTime);
  // start times don't match, meaning the server lost our change
  
  T(db.open("4") != null);
  
  // retry with no server restart
  
  var instanceStartTime = db.info().instance_start_time;
  
  T(db.save({_id:"5",a:2,b:4}).ok);
  T(db.open("5") != null);
  
  var commitResult = db.ensureFullCommit();
  T(commitResult.ok && commitResult.instance_start_time == instanceStartTime);
  // Successful commit, start times match!
  
  restartServer();
  
  T(db.open("5") != null);
  
  // Now test that when we exceed the max_dbs_open, pending commits are safely
  // written.
  T(db.save({_id:"6",foo:"bar"}).ok);
  var max = 2;
  run_on_modified_server(
    [{section: "couchdb",
      key: "max_dbs_open",
      value: max.toString()}],

    function () {
      for(var i=0; i<max; i++) {
        var dbi = new CouchDB("test_suite_db" + i);
        dbi.deleteDb();
        dbi.createDb();
      }
      T(db.open("6").foo=="bar");
      for(var i=0; i<max+1; i++) {
        var dbi = new CouchDB("test_suite_db" + i);
        dbi.deleteDb();
      }
    });
  
};
