
var assert = require('assert');
var should = require('should');
var colors = require('colors');

var winschema = require('../');
var winback = require('win-backbone');
var Q = require('q');
var util = require('util');

var backLog, backEmit;

var cbFunction = function(defer)
{
	return function() {
		var err = [].shift.call(arguments);

		if(err)
			defer.reject(err);
		else{
			// backLog("Arg lenth: ".cyan,arguments.length);
			var nArgs = [];
			for(var i=0; i < arguments.length; i++)
				nArgs.push(arguments[i]);
			//take out the error
			defer.resolve.apply(this, nArgs);
			// backLog("Arg after: ".red, arguments);
		}
	};
}

var qBackboneEmit = function()
{
	//defer the mofo please!
	var defer = Q.defer();

	var oArgs = arguments;

	var cb = cbFunction(defer);
	[].push.call(oArgs, cb);

	backEmit.apply(backEmit, oArgs);

	//send back our promise to resolve/reject
	return defer.promise;
}

var emptyModule = 
{
	winFunction : "test",
	eventCallbacks : function(){ return {}; },
	requiredEvents : function() {
		return [
		"schema:addSchema",
		"schema:getSchema",
		"schema:getSchemaReferences",
        "schema:getSchemaProperties",
        "schema:getReferencesAndParents",
		"schema:replaceParentReferences",
		"schema:getFullSchema",
		"schema:validate",
		"schema:validateMany"
		];
	},
	initialize : function(done)
    {
        process.nextTick(function()
        {
            done();
        })
    }
};

var otherSchema = {
    type : "array",
    things : "string"
    // {"$ref" : "exampleSchema"}
};
var exampleSchema  = {
    // noFirst : "object",
    // yesFirst : {type: "object", yesSecond: {noThird: "array", noFourth: "object"}},
    bugger : {aThing : "string", inner: {type: "array", test: "string"}},
    // noSecond : "array",
    ref : {"$ref": "secondSchema"},
    firstArray: {
        type : "array",
        "$ref": "secondSchema",
        // items : {
            // type : "object",
            // properties :{
                // stuff : "string"
            // }
        // }
    }
    // required : ['hope', 'stuff']     
};

describe('Testing Win Generating Artifacts -',function(){

    //we need to start up the WIN backend
    before(function(done){

    	//create backbone up front :)
    	backbone = new winback();

    	var sampleJSON = 
		{
			"win-schema" : winschema,
			"test" : emptyModule
		};

		var configurations = 
		{
			// "global" : {},
			"win-schema" : {
				logLevel : backbone.testing,
				multipleErrors : true,
				allowAnyObjects : false,
				requireByDefault : false
			}
		};


    	//set global log level - can be modified at module level
    	backbone.logLevel = backbone.testing;

    	backEmit = backbone.getEmitter(emptyModule);

    	//logger are assumed to be as verbose as the backbone at creation
    	backLog = backbone.getLogger({winFunction: "mocha"});


    	//loading modules is synchronous
    	backbone.loadModules(sampleJSON, configurations);

    	var registeredEvents = backbone.registeredEvents();
    	var requiredEvents = backbone.moduleRequirements();
    		
    	backLog.log('Backbone Events registered: ', registeredEvents);
    	backLog.log('Required: ', requiredEvents);

    	backbone.initializeModules(function()
    	{
 			done();
    	});

    });

   it('Should tell me references successfully',function(done){

        var otherSchema = {
            type : "object",
            things : "string"
        };
        var exampleSchema  = {
            bugger : {aThing : "string", inner: {type: "array", test: "string"}},
            ref : {"$ref": "t1Schema2"},
            firstArray: {
                type : "array",
                "$ref": "t1Schema2",
            }
        };
        var validExample = {
            bugger : {aThing : "help", inner:[]},
            // hope : { notProp: 5, isProp: 5},
            ref : {wid: "refWID", parents: ["refp1", "refp2"], things : "stuff"},
            firstArray : [{wid: "arrayWID", parents: ["arrayp1", "arrayp2"], dbType: "t1Schema2", things: "stuff"}],
            wid : "originalObject"
            ,dbType : "t1Schema"
            ,parents : ["op1"]
        };


        qBackboneEmit("schema:addSchema", "t1Schema1", exampleSchema)
            .then(function()
            {
                backLog('Adding secondSchema');
                //add schema without any WIn things attached to it-- with the options param!
                return qBackboneEmit("schema:addSchema", "t1Schema2", otherSchema, {skipWINAdditions: false});
            })
            .then(function()
            {
                 //make sure full schema is defined for this object
                return qBackboneEmit("schema:getFullSchema", "t1Schema1");
            })
            .then(function()
            {
                var tests = {};
                tests[validExample.wid] = validExample;
                return qBackboneEmit("schema:getReferencesAndParents", "t1Schema1", tests);
            })
            .then(function(sRefs)
            {
                backLog("\tSchema ref and parents: ".cyan, util.inspect(sRefs, false, 10));
                //lets actually do some testing, why not?

                var refs = sRefs[validExample.wid];
                validExample.parents.join(',').should.equal(refs[validExample.wid].join(','));
                validExample.ref.parents.join(',').should.equal(refs[validExample.ref.wid].join(','));
                validExample.firstArray[0].parents.join(',').should.equal(refs[validExample.firstArray[0].wid].join(','));

                //woah, they matched, that's crazy!
                done();
            })
            .fail(function(err){
                // backLog('Error found: ', err);
                
                err = typeof err == "string" ? new Error(err) : err;
                done(err);
            });        
    });

   it('Should replace references successfully',function(done){

        var otherSchema = {
            type : "object",
            things : "string"
        };
        var exampleSchema  = {
            bugger : {aThing : "string", inner: {type: "array", test: "string"}},
            ref : {"$ref": "t2Schema-2"},
            firstArray: {
                type : "array",
                "$ref": "t2Schema-2",
            }
        };
        var validExample = {
            bugger : {aThing : "help", inner:[]},
            // hope : { notProp: 5, isProp: 5},
            ref : {wid: "refWID", parents: ["refp1", "refp2"], things : "stuff"},
            firstArray : [{wid: "arrayWID", parents: ["arrayp1", "arrayp2"], dbType: "t2Schema-2", things: "stuff"}],
            wid : "originalObject"
            ,dbType : "t2Schema-1"
            ,parents : ["op1"]
        };

        var toReplace = {};
        
        qBackboneEmit("schema:addSchema", "t2Schema-1", exampleSchema)
            .then(function()
            {
                backLog('Adding secondSchema');
                //add schema without any WIn things attached to it-- with the options param!
                return qBackboneEmit("schema:addSchema", "t2Schema-2", otherSchema, {skipWINAdditions: false});
            })
            .then(function()
            {
                 //make sure full schema is defined for this object
                return qBackboneEmit("schema:getFullSchema", "t2Schema-1");
            })
            .then(function()
            {
                toReplace[validExample.wid] = ["rootReplace"];
                toReplace[validExample.ref.wid] = ["refReplace1", "refReplace2"];
                toReplace[validExample.firstArray[0].wid] = ["farrayReplace1", "farrayReplace2"]

                return qBackboneEmit("schema:replaceParentReferences", "t2Schema-1", validExample, toReplace);
            })
            .then(function(replaced)
            {
                backLog("\tSchema ref reaplced: ".cyan, util.inspect(replaced, false, 10));
                //lets actually do some testing, why not?

                validExample.dbType = "bubbly";
                //test that we made an actual clone, not the same object
                validExample.dbType.should.not.equal(replaced.ref);

                toReplace[validExample.wid].join('').should.equal(replaced.parents.join(''));
                toReplace[validExample.ref.wid].join('').should.equal(replaced.ref.parents.join(''));
                toReplace[validExample.firstArray[0].wid].join('').should.equal(replaced.firstArray[0].parents.join(''));

                //it worked that cray! Okay, I'll see myself out.
                done();
            })
            .fail(function(err){
                // backLog('Error found: ', err);
                
                err = typeof err == "string" ? new Error(err) : err;
                done(err);
            });        
    });

    it('Should add schema successfully',function(done){
        done();
        return;

    	var thingy = {
    		bugger : {skip : "string"},
    		hope : "stuff",
    		stuff : {
    			num : 4,
    			inner : {

    				geno : {things : []},
    				geno2 : "some string"
    			}
    		}
    	}

    	var validExample = {
    		bugger : {aThing : "help", inner:[]},
    		// hope : { notProp: 5, isProp: 5},
    		ref :[ 
    			{things : "stuff"}
    		],
    		firstArray : [[{things: "stuff"}]],
    		wid : "abcded"
    		,dbType : "exampleSchema"
    		,parents : []
    		// , stuff : {
    			// num : "5",
    			// inner: {
    				// geno : {},
    				// geno2 : "some string"
    			// },
    			// wrong : "things"
    		// },
    		// not : "the right stuff"
    	};

		backLog('Adding exampleSchema');
    	qBackboneEmit("schema:addSchema", "exampleSchema", exampleSchema)
    		.then(function()
			{
				backLog('Adding secondSchema');
				//add schema without any WIn things attached to it-- with the options param!
		 		return qBackboneEmit("schema:addSchema", "secondSchema", otherSchema, {skipWINAdditions: true});
			})
			.then(function()
			{
				return qBackboneEmit("schema:getSchemaReferences", "exampleSchema");
			})
			.then(function(sRefs)
			{
				backLog("\tSchema refs: ".cyan, util.inspect(sRefs, false, 10));
				return qBackboneEmit("schema:getFullSchema", "exampleSchema");
			})
    		.then(function(fullSchema)
    		{	
    			var defer = Q.defer();

    			backLog("\tFull schema: ".blue, util.inspect(fullSchema[0], false, 10));

    			backEmit("schema:validate", "exampleSchema", validExample, function(err, isValid, issues)
    			{
    				if(err){
    					defer.reject(err);
    					return;
    				}

    				backLog('Valid? ' + isValid);

    				if(isValid)
    					should.not.exist(issues);// issues.errors.should.not.exist();
    				else
    					should.exist(issues);
    				// console.log("IsValid: ", isValid, " if no, why not? ", issues);
    				defer.resolve();
    			});

    			return defer.promise;
    		})
    		.then(function()
    		{
		 		return qBackboneEmit("schema:getSchemaProperties", ["exampleSchema", "secondSchema"]);
    		})
    		.then(function(props)
    		{
    			backLog("\n\tSchema props: ".magenta, props[0], "\n")
    			backLog("\n\tSchema props2: ".magenta, props[1], "\n")
    			var defer = Q.defer();

    			backEmit("schema:validateMany", "exampleSchema", [validExample, thingy], function(err, isValid, issues)
    			{
    				if(err){
    					defer.reject(err);
    					return;
    				}

    				backLog('Many Valid? ' + isValid);

    				if(!isValid)
    				{
    					var validity = [];
    					for(var i=0; i < issues.length; i++)
    					{
    						backLog("Is object " + i + " valid? ".green, (issues[i].length ? "No.".red : "Yes.".blue));
    						var aIssue = issues[i];
    						for(var e=0; e < aIssue.length; e++)
    						{
    							validity.push(aIssue[e].dataPath + "- issue: " + aIssue[e].message);
    						}
    					}
    					throw new Error(JSON.stringify(validity));
    				}
    				// backLog("Issues: ", issues);

    				if(isValid)
    					should.not.exist(issues);// issues.errors.should.not.exist();
    				else
    					should.exist(issues);
    				
    				// console.log("IsValid: ", isValid, " if no, why not? ", issues);
    				defer.resolve();
    			});

    			return defer.promise;
    		})
    		.then(function(isValid, issues)
    		{
    			done();
    		})
    		.fail(function(err){
    			// backLog('Error found: ', err);
    			
    			err = typeof err == "string" ? new Error(err) : err;
    			done(err);
    		});

    });




});