module.exports = sampleEvo;

function sampleEvo(winBackbone)
{
	var self = this;

	self.wbb = winBackbone;

	self.winFunction = "evolution";

	self.rEvents = 
	{
		"save" : 
		{
			"batchSave" : "save:batchSave",
			"getArtifacts" : "save:getArtifacts"
		}
	}

	var createIndividual = function(id, fn)
	{
		// console.log('Creating individual: ', id);
		fn("individual stuff");
	}
	var selectParent = function(pID, saved)
	{
		//select the parent here!
		//then we call save!
		// console.log('Saving parent: ', pID)

		//maybe we save all parental objects
		saved("parent saved now");
	}

	var fullEventName = function(partialName)
	{
		return self.winFunction + ":" + partialName;
	}
	//we are evolution
	//these are the various callbacks we accept as events
	self.eventCallbacks = function()
	{
		var callbacks = {};

		//add callbacks to the object-- these are the functions called when the full event is emitted
		callbacks[fullEventName("createIndividual")] = createIndividual;
		callbacks[fullEventName("selectParent")] = selectParent;

		//send back our callbacks
		return callbacks;
	}

	self.requiredEvents = function()
	{
		//don't require any outside modules
		var events = [];
			
		//turn our events into an array
		//events are easier organized as an object, but for requirements, we send as array
		for(var func in self.rEvents)
		{
			for(var action in self.rEvents[func])
			{
				events.push(self.rEvents[func][action]);
			}
		}

		//send back all required events
		return events;
	}

	self.initialize = function(done)
	{
		process.nextTick(function()
		{
			done();
		})
	}
	
	return self;
}


