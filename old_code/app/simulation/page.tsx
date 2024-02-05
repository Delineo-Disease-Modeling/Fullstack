"use client";
// import Inputsimulator from "@/components/About/Inputsimulator";
import React, { useState } from "react";
import axios from "axios";

const AboutPage = () => {
  const [location, setLocation] = useState("Baltimore");
  const [model, setModel] = useState("POI- Wells-Reily");
  const [infectious, setInfectious] = useState(0);
  const [days, setDays] = useState(0);
  const [maskValue, setMaskValue] = useState(0.5);
  const [vaccineValue, setVaccineValue] = useState(0.5);
  const [capacityValue, setCapacityValue] = useState(0.5);
  const [quarantineValue, setQuarantineValue] = useState(0.5);
  const [isLockdown, setIsLockdown] = useState(false);

  const handleLocationChange = (event) => {
    setLocation(event.target.value);
  }
  const handleModelChange = (event) => {
    setModel(event.target.value);
  }
  const handleMaskChange = (event) => {
    setMaskValue(event.target.value);
  };
  const handleInfectiousChange = (event) => {
    setInfectious(event.target.value);
  }
  const handleDaysChange = (event) => {
    setDays(event.target.value);
  }
  const handleVaccineChange = (event) => {
    setVaccineValue(event.target.value);
  };
  const handleCapacityChange = (event) => {
    setCapacityValue(event.target.value);
  };
  const handleQuarantineChange = (event) => {
    setQuarantineValue(event.target.value);
  };
  

  const handleSubmit = (event) => {
    event.preventDefault();
    const data = {
      location: location,
      model: model,
      infectious: infectious,
      days: days,
      maskValue: maskValue/100,
      vaccineValue: vaccineValue/100,
      capacityValue: capacityValue/100,
      quarantineValue: quarantineValue/100,
      isLockdown: isLockdown,
    };
    console.log(data);
    axios
    //http://127.0.0.1:5000/simulation/
    //http://localhost:3000/simulation
      .post("http://127.0.0.1:5000/simulation/", data)
      .then((res) => {
        //console.log(res);
        //console.log(res.data);
      })
      .catch((error) => {
        console.log(error.response);
      });
  };
  return (
    <>
      {/* <Breadcrumb
        pageName="S"
        description="SS"
          
      /> */}
       
       <section id="contact" className="overflow-hidden py-16 md:py-20 lg:py-28 w-full">
        <div className="-mx-4 flex flex-wrap ">
          <div className="w-full px-4 lg:w-7/12 xl:w-8/12 center">
            <div
              className="wow fadeInUp mb-12 rounded-md bg-primary/[3%] py-11 px-8 dark:bg-dark sm:p-[55px] lg:mb-5 lg:px-8 xl:p-[55px]"
              data-wow-delay=".15s
              "
            >
              <h2 className="mb-3 text-2xl font-bold text-black dark:text-white sm:text-3xl lg:text-2xl xl:text-3xl">
                Simulator
              </h2>
              <p className="mb-12 text-base font-medium text-body-color">
              The inputs that the user needs to enter to run a simulation:
             
              </p>

              <form>
                <div className="-mx-4 flex flex-wrap">

                <div className="w-full px-4 md:w-1/2">
                    
                    <div className="mb-8">
                      <label
                        htmlFor="sel"
                        className="mb-3 block text-sm font-medium text-dark dark:text-white"
                      >
                        Location/City 
                      </label>
                      <select className="w-full rounded-md border border-transparent py-3 px-6 text-base text-body-color placeholder-body-color shadow-one outline-none focus:border-primary focus-visible:shadow-none dark:bg-[#242B51] dark:shadow-signUp"
                      onChange={handleLocationChange}>
                       <option className="w-full rounded-md border border-transparent py-3 px-6 text-base text-body-color placeholder-body-color shadow-one outline-none focus:border-primary focus-visible:shadow-none dark:bg-[#242B51] dark:shadow-signUp"
                       value="Baltimore">Baltimore</option>
                       <option className="w-full rounded-md border border-transparent py-3 px-6 text-base text-body-color placeholder-body-color shadow-one outline-none focus:border-primary focus-visible:shadow-none dark:bg-[#242B51] dark:shadow-signUp"
                      value="New York">New York</option>
                        <option className="w-full rounded-md border border-transparent py-3 px-6 text-base text-body-color placeholder-body-color shadow-one outline-none focus:border-primary focus-visible:shadow-none dark:bg-[#242B51] dark:shadow-signUp"
                      value="Charlotte">Charlotte</option>
                       <option className="w-full rounded-md border border-transparent py-3 px-6 text-base text-body-color placeholder-body-color shadow-one outline-none focus:border-primary focus-visible:shadow-none dark:bg-[#242B51] dark:shadow-signUp"
                      value="Fargo">Fargo</option>
                         <option className="w-full rounded-md border border-transparent py-3 px-6 text-base text-body-color placeholder-body-color shadow-one outline-none focus:border-primary focus-visible:shadow-none dark:bg-[#242B51] dark:shadow-signUp"
                      value="Atlanta">Atlanta</option>
                       <option className="w-full rounded-md border border-transparent py-3 px-6 text-base text-body-color placeholder-body-color shadow-one outline-none focus:border-primary focus-visible:shadow-none dark:bg-[#242B51] dark:shadow-signUp"
                      value="Chicago">Chicago</option>
                         <option  className="w-full rounded-md border border-transparent py-3 px-6 text-base text-body-color placeholder-body-color shadow-one outline-none focus:border-primary focus-visible:shadow-none dark:bg-[#242B51] dark:shadow-signUp"
                      value="Los Angeles">Los Angeles</option>
                       </select>
 

                    </div>

                    

                  </div>

                  <div className="w-full px-4 md:w-1/2">
                    
                    <div className="mb-8">
                      <label
                        htmlFor="sel"
                        className="mb-3 block text-sm font-medium text-dark dark:text-white"
                      >
                        Models for disease transmission 
                      </label>
                      <select className="w-full rounded-md border border-transparent py-3 px-6 text-base text-body-color placeholder-body-color shadow-one outline-none focus:border-primary focus-visible:shadow-none dark:bg-[#242B51] dark:shadow-signUp"
                      onChange={handleModelChange}>
                       <option className="w-full rounded-md border border-transparent py-3 px-6 text-base text-body-color placeholder-body-color shadow-one outline-none focus:border-primary focus-visible:shadow-none dark:bg-[#242B51] dark:shadow-signUp"
                       value="POI- Wells-Reily">POI- Wells-Reily</option>
                       <option className="w-full rounded-md border border-transparent py-3 px-6 text-base text-body-color placeholder-body-color shadow-one outline-none focus:border-primary focus-visible:shadow-none dark:bg-[#242B51] dark:shadow-signUp"
                      value="New York">POI- Wells-Reily</option>
                        <option className="w-full rounded-md border border-transparent py-3 px-6 text-base text-body-color placeholder-body-color shadow-one outline-none focus:border-primary focus-visible:shadow-none dark:bg-[#242B51] dark:shadow-signUp"
                      value="Charlotte">POI- Wells-Reily</option>
                       <option className="w-full rounded-md border border-transparent py-3 px-6 text-base text-body-color placeholder-body-color shadow-one outline-none focus:border-primary focus-visible:shadow-none dark:bg-[#242B51] dark:shadow-signUp"
                      value="Fargo">Wells-Reily</option>
                         <option className="w-full rounded-md border border-transparent py-3 px-6 text-base text-body-color placeholder-body-color shadow-one outline-none focus:border-primary focus-visible:shadow-none dark:bg-[#242B51] dark:shadow-signUp"
                      value="Atlanta">Others</option>
                       <option className="w-full rounded-md border border-transparent py-3 px-6 text-base text-body-color placeholder-body-color shadow-one outline-none focus:border-primary focus-visible:shadow-none dark:bg-[#242B51] dark:shadow-signUp"
                      value="Chicago">Others</option>
                         <option  className="w-full rounded-md border border-transparent py-3 px-6 text-base text-body-color placeholder-body-color shadow-one outline-none focus:border-primary focus-visible:shadow-none dark:bg-[#242B51] dark:shadow-signUp"
                      value="Los Angeles">Others</option>
                       </select>
 

                    </div>

                    

                  </div>


                  <div className="w-full px-4 md:w-1/2">
                    <div className="mb-8">
                      <label
                        htmlFor="name"
                        className="mb-3 block text-sm font-medium text-dark dark:text-white"
                      >
                        Number of Infectious people at the beginning(MAX?)
                      </label>
                      <input
                        type="number"
                        placeholder="Enter the number of infectious people at the start"
                        className="w-full rounded-md border border-transparent py-3 px-6 text-base text-body-color placeholder-body-color shadow-one outline-none focus:border-primary focus-visible:shadow-none dark:bg-[#242B51] dark:shadow-signUp"
                        onChange={handleInfectiousChange}
                      />
                    </div>
                  </div>
                  <div className="w-full px-4 md:w-1/2">
                    <div className="mb-8">
                      <label
                        htmlFor="number"
                        className="mb-3 block text-sm font-medium text-dark dark:text-white"
                      >
                        The number of days of the run (MAX?)
                      </label>
                      <input
                        type="number"
                        placeholder="Enter the number of days of the run "
                        className="w-full rounded-md border border-transparent py-3 px-6 text-base text-body-color placeholder-body-color shadow-one outline-none focus:border-primary focus-visible:shadow-none dark:bg-[#242B51] dark:shadow-signUp"
                        onChange={handleDaysChange}
                      />
                    </div>
                  </div>

                 
                  <div className="w-full px-4 md:w-1/4">
                    <div className="mb-8">
                      <label
                        htmlFor="number"
                        className="mb-3 block text-sm font-medium text-dark dark:text-white"
                      >
                        Mask wearing(%)
                      </label>
                      <input
                        type="range" id="volume" name="volume" min="0" max="100" step="0.01"
                        value={maskValue} onChange={handleMaskChange}
                        placeholder="Enter the number of days of the run "
                        className="w-full py-5 px-0"
                      />
            
                    </div>
                  </div>
                

                  <div className="w-full px-4 md:w-1/4">
                    <div className="mb-8">
                      <label
                        htmlFor="number"
                        className="mb-3 block text-sm font-medium text-dark dark:text-white"
                      >
                        Vaccinated population(%)
                      </label>
                      <input
                        type="range" id="volume" name="volume" min="0" max="100" step="0.01"
                        value={vaccineValue} onChange={handleVaccineChange}
                        placeholder="Enter the number of days of the run "
                        className="w-full py-5 px-0"
                      />
            
                    </div>
                  </div>
                  <div className="w-full px-4 md:w-1/4">
                    <div className="mb-8">
                      <label
                        htmlFor="number"
                        className="mb-3 block text-sm font-medium text-dark dark:text-white"
                      >
                        Capacity restriction(%)
                      </label>
                      <input
                        type="range" id="volume" name="volume" min="0" max="100" step="0.01"
                        value={capacityValue} onChange={handleCapacityChange}
                        placeholder="Enter the number of days of the run "
                        className="w-full py-5 px-0"
                      />
            
                    </div>
                  </div>
                  <div className="w-full px-4 md:w-1/4">
                    <div className="mb-8">
                      <label
                        htmlFor="number"
                        className="mb-3 block text-sm font-medium text-dark dark:text-white"
                      >
                        Quarantine compliance among population(%)
                      </label>
                      <input
                        type="range" id="volume" name="volume" min="0" max="100" step="0.01"
                        value={quarantineValue} onChange={handleQuarantineChange}
                        placeholder="Enter the number of days of the run "
                        className="w-full py-5 px-0"
                      />
            
                    </div>
                  </div>
                  <div className="w-full px-4">
                    <div className="mb-8">
                      <label
                        htmlFor="lockdown"
                        className="mb-3 block text-sm font-medium text-dark dark:text-white"
                      >
                        Lockdown
                      </label>
                      <input
                        type="checkbox"
                        id="lockdown"
                        checked={isLockdown}
                        onChange={() => setIsLockdown(!isLockdown)}
                        className="form-checkbox h-5 w-5 text-primary focus:ring-primary-dark"
                      />
                    </div>
                  </div>
                  <div className="w-full px-4">
                    <button onClick={handleSubmit}
                    className="rounded-md bg-primary py-4 px-9 text-base font-medium text-white transition duration-300 ease-in-out hover:bg-opacity-80 hover:shadow-signUp">
                      Submit
                    </button>
                  </div>

     <p>   IF DO NOT USE CAN DELETE THIS MEMO  </p>
                  <div className="w-full px-4">
                    <div className="mb-8">
                      <label
                        htmlFor="message"
                        className="mb-3 block text-sm font-medium text-dark dark:text-white"
                      >
                        Memo
                      </label>
                      <textarea
                        name="message"
                        rows={5}
                        placeholder=" The community to be simulated (from a dropdown menu)
                        The number of days of the run (bounded by the number of days for which movement has been stored)
                        The number of infectious people at the start of the simulation
                        A means for changing the default profile of a POI or a class of POIs to make them more conducive or less conducive to transmitting disease
                        Choice of model for disease transmission in POI- Wells-Reily or others (from dropdown menu)
                        Community level interventions:
                        Lockdown or capacity reduction of specific POIs or classes of POIs
                        Percentage of people wearing masks and effectiveness factors for mask-wearing
                        Percentage of people having had vaccination A, B, C,… and effectiveness factor of each
                        Degree of social distancing practiced in POIs
                        Degree of quarantining by those who are infectious
                        Others?
                        Means to upload DMP parameters (see DMP team for their requirements) "
                        className="w-full resize-none rounded-md border border-transparent py-3 px-6 text-base text-body-color placeholder-body-color shadow-one outline-none focus:border-primary focus-visible:shadow-none dark:bg-[#242B51] dark:shadow-signUp"
                      ></textarea>
                    </div>
                  </div>




                </div>
              </form>
            </div>
          </div>
          
        </div>

    </section>




       {/* <Inputsimulator /> */}
      
       {/* <AboutSectionOne /> */}
      {/* <AboutSectionTwo />  */}
    </>
  );
};


export default AboutPage;
