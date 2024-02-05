import { Blog } from "@/types/blog";

const blogData: Blog[] = [
  {
    id: 1,
    title: "The Wells-Riley Equation",
    paragraph:
      "The Delineo simulation uses the Wells-Riley Equation to simulate how a disease will spread in any given facility. The equation and the simulation focus on points of interest (POI's), which include facilities such as grocery stores, places of worship, and other types of gathering areas where a person might get infected. ",
    image: "/images/blog/blogPic1.jpg",
    author: {
      name: "First Author",
      image: "/images/blog/author-01.png",
      designation: "Graphic Designer",
    },
    publishDate: "2025",
  },
  {
    id: 2,
    title: "Machine Learning Explainer",
    paragraph:
      "Our model uses the Iterative Proportional Fitting Procedure (IPFP), a classical algorithm in computer science that performs data scaling based on current datasets, to create a mobility network containing information about the number of individuals (agents) traveling from each Census Block Group (CBG) to Point of Interest (POI).",
    image: "/images/blog/blogPic2.png",
    author: {
      name: "Second Author",
      image: "/images/blog/author-02.png",
      designation: "Content Writer",
    },
    publishDate: "2025",
  },
  {
    id: 3,
    title: "Simulation Development",
    paragraph:
      "Currently, the simulation team is working on the severity risk matrix, which is how they decide whether an agent is asymptomatic, mild, severe, or critical after their incubation period is over after exposure. The figure below illustrates the different stages before reaching the severity risk matrix determination.",
    image: "/images/blog/blogPic3.png",
    author: {
      name: "Third Author",
      image: "/images/blog/author-03.png",
      designation: "Graphic Designer",
    },
    publishDate: "2025",
  },
];
export default blogData;
